use half::f16;
use wgpu::util::DeviceExt;

const SIZE: u32 = 16;

struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    shader: wgpu::ShaderModule,
    common: wgpu::ShaderModule,
}

impl Gpu {
    fn new() -> Self {
        pollster::block_on(async {
            let instance = wgpu::Instance::new(
                wgpu::InstanceDescriptor::new_without_display_handle_from_env(),
            );
            let adapter = instance
                .request_adapter(&wgpu::RequestAdapterOptions::default())
                .await
                .expect("GPU tests require a Vulkan adapter, including Mesa lavapipe");
            let (device, queue) = adapter
                .request_device(&wgpu::DeviceDescriptor::default())
                .await
                .unwrap();
            let common_source = include_str!("../../../src-tauri/src/shaders/compute_common.wgsl");
            let module = |source: String| {
                device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("Effect Studio test"),
                    source: wgpu::ShaderSource::Wgsl(source.into()),
                })
            };
            let shader = module(format!(
                "{}\n{common_source}",
                include_str!("../../../src-tauri/src/shaders/effect_studio.wgsl"),
            ));
            let common = module(format!(
                "struct Params {{ grid: Grid }}\n@group(0) @binding(7) var<uniform> params: Params;\n{common_source}"
            ));
            Self {
                device,
                queue,
                shader,
                common,
            }
        })
    }

    fn texture(&self, size: (u32, u32), format: wgpu::TextureFormat) -> wgpu::Texture {
        self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Studio test image"),
            size: wgpu::Extent3d {
                width: size.0,
                height: size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        })
    }

    fn upload(&self, image: &[[f32; 4]], size: (u32, u32)) -> wgpu::Texture {
        assert_eq!(image.len(), (size.0 * size.1) as usize);
        let input = self.texture(size, wgpu::TextureFormat::Rgba16Float);
        let pixels: Vec<u8> = image
            .iter()
            .flatten()
            .flat_map(|v| f16::from_f32(*v).to_le_bytes())
            .collect();
        self.queue.write_texture(
            input.as_image_copy(),
            &pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(size.0 * 8),
                rows_per_image: Some(size.1),
            },
            input.size(),
        );
        input
    }

    fn dispatch(
        &self,
        entry: &str,
        settings: &[u32; 56],
        inputs: &[&wgpu::Texture],
        output: &wgpu::Texture,
    ) {
        let bytes: Vec<u8> = settings.iter().flat_map(|v| v.to_le_bytes()).collect();
        let params = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: None,
                contents: &bytes,
                usage: wgpu::BufferUsages::UNIFORM,
            });
        let pipeline = self
            .device
            .create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: None,
                layout: None,
                module: if entry.starts_with("box_") {
                    &self.common
                } else {
                    &self.shader
                },
                entry_point: Some(entry),
                compilation_options: Default::default(),
                cache: None,
            });
        let views: Vec<_> = inputs
            .iter()
            .map(|t| t.create_view(&Default::default()))
            .collect();
        let output_view = output.create_view(&Default::default());
        let mut entries: Vec<_> = views
            .iter()
            .enumerate()
            .map(|(binding, view)| wgpu::BindGroupEntry {
                binding: binding as u32,
                resource: wgpu::BindingResource::TextureView(view),
            })
            .collect();
        entries.extend([
            wgpu::BindGroupEntry {
                binding: 7,
                resource: params.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: if output.format() == wgpu::TextureFormat::Rgba32Float {
                    8
                } else {
                    9
                },
                resource: wgpu::BindingResource::TextureView(&output_view),
            },
        ]);
        let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipeline.get_bind_group_layout(0),
            entries: &entries,
        });
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_compute_pass(&Default::default());
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &group, &[]);
            pass.dispatch_workgroups(output.width().div_ceil(8), output.height().div_ceil(8), 1);
        }
        self.queue.submit([encoder.finish()]);
    }

    fn read(&self, output: &wgpu::Texture) -> Vec<[f32; 4]> {
        let row = (output.width() * 8).div_ceil(256) * 256;
        let readback = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: (row * output.height()) as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            output.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: Some(output.height()),
                },
            },
            output.size(),
        );
        self.queue.submit([encoder.finish()]);
        let (send, recv) = std::sync::mpsc::channel();
        readback
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |result| {
                send.send(result).unwrap()
            });
        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .unwrap();
        recv.recv().unwrap().unwrap();
        let mapping = readback.slice(..).get_mapped_range();
        let result = mapping
            .chunks_exact(row as usize)
            .flat_map(|row| {
                row[..output.width() as usize * 8]
                    .chunks_exact(8)
                    .map(|px| {
                        std::array::from_fn(|i| {
                            f16::from_le_bytes([px[i * 2], px[i * 2 + 1]]).to_f32()
                        })
                    })
            })
            .collect();
        drop(mapping);
        readback.unmap();
        result
    }

    fn render(&self, image: &[[f32; 4]], settings: &[u32; 56], entry: &str) -> Vec<[f32; 4]> {
        let size = (settings[0], settings[1]);
        let input = self.upload(image, size);
        let output = self.texture(size, wgpu::TextureFormat::Rgba16Float);
        self.dispatch(entry, settings, &[&input], &output);
        self.read(&output)
    }

    fn blur(&self, input: &wgpu::Texture, settings: &[u32; 56], radius: u32) -> wgpu::Texture {
        if input.width() < 2 || input.height() < 2 {
            return input.clone();
        }
        let size = (input.width(), input.height());
        let mut s = *settings;
        s[4] = radius;
        s[6] = 0;
        let mut current = None;
        for _ in 0..2 {
            let tmp = self.texture(size, wgpu::TextureFormat::Rgba32Float);
            let out = self.texture(size, wgpu::TextureFormat::Rgba32Float);
            self.dispatch("box_h", &s, &[current.as_ref().unwrap_or(input)], &tmp);
            self.dispatch("box_v", &s, &[&tmp], &out);
            current = Some(out);
        }
        current.unwrap()
    }

    fn normalize(&self, image: &[[f32; 4]], settings: &[u32; 56]) -> Vec<[f32; 4]> {
        let size = (settings[0], settings[1]);
        let scale = (1024.0 / size.0.max(size.1) as f32).min(1.0);
        let map_size = (
            (size.0 as f32 * scale).round().max(1.0) as u32,
            (size.1 as f32 * scale).round().max(1.0) as u32,
        );
        let mut s = *settings;
        s[..4].copy_from_slice(&[map_size.0, map_size.1, size.0, size.1]);
        let short_side = map_size.0.min(map_size.1) as f32;
        s[4] = (f32::from_bits(s[34]) * short_side / 1080.0)
            .round()
            .max(1.0) as u32;
        let input = self.upload(image, size);
        let luma = self.texture(map_size, wgpu::TextureFormat::Rgba32Float);
        let horizontal = self.texture(map_size, wgpu::TextureFormat::Rgba32Float);
        let range = self.texture(map_size, wgpu::TextureFormat::Rgba32Float);
        self.dispatch("studio_normalize_down", &s, &[&input], &luma);
        self.dispatch("studio_normalize_range_h", &s, &[&luma], &horizontal);
        self.dispatch("studio_normalize_range_v", &s, &[&horizontal], &range);
        let radius = ((0.01 + 0.06 * f32::from_bits(s[35])) * short_side * 1.225)
            .round()
            .max(1.0) as u32;
        let bounds = self.blur(&range, &s, radius);
        let mean = self.blur(&luma, &s, radius.div_ceil(2));
        let output = self.texture(size, wgpu::TextureFormat::Rgba16Float);
        self.dispatch(
            "studio_normalize",
            settings,
            &[&input, &bounds, &mean],
            &output,
        );
        self.read(&output)
    }
}

fn settings() -> [u32; 56] {
    let mut s = [0; 56];
    s[0] = SIZE;
    s[1] = SIZE;
    // Grid (32), Feedback (48), Prism (48), Local Normalize (16), Kaleidoscope (80).
    s[8] = 1;
    s[9] = 1;
    s[10] = 0.5f32.to_bits();
    s[12] = 1.0f32.to_bits();
    s[13] = 0.65f32.to_bits();
    s[15] = 1.0f32.to_bits();
    s[16] = 0.03f32.to_bits();
    s[20] = 1;
    s[21] = 1;
    s[22] = 1.0f32.to_bits();
    s[23] = 60.0f32.to_bits();
    s[27] = 1.0f32.to_bits();
    s[28] = 0.03f32.to_bits();
    s
}

fn image() -> Vec<[f32; 4]> {
    (0..SIZE * SIZE)
        .map(|i| {
            [
                3.0 * (i % SIZE) as f32 / (SIZE - 1) as f32,
                (i / SIZE) as f32 / SIZE as f32,
                0.1,
                0.625,
            ]
        })
        .collect()
}

fn max_difference(a: &[[f32; 4]], b: &[[f32; 4]]) -> f32 {
    a.iter()
        .flatten()
        .zip(b.iter().flatten())
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f32::max)
}

#[test]
fn whole_image_masks_strength_and_stack() {
    let gpu = Gpu::new();
    let input = image();
    let s = settings();
    let feedback = gpu.render(&input, &s, "studio_feedback_pass");
    for (i, pixel) in feedback.iter().enumerate() {
        let expected = 0.75 + 1.5 * (i as u32 % SIZE) as f32 / (SIZE - 1) as f32;
        assert!(
            (pixel[0] - expected).abs() < 0.004,
            "full-strength feedback must transform the whole input"
        );
        assert_eq!(pixel[3], 0.625);
    }
    for (entry, base) in [("studio_feedback_pass", 8), ("studio_prism_pass", 20)] {
        let full = gpu.render(&input, &s, entry);
        assert!(max_difference(&full, &input) > 0.05);
        let mut masked = s;
        masked[base + 10] = 1;
        let full_window = gpu.render(&input, &masked, entry);
        assert!(
            max_difference(&full, &full_window) < 0.001,
            "full-range masks must include HDR values"
        );
        masked[base + 6] = 0.2f32.to_bits();
        masked[base + 7] = 0.3f32.to_bits();
        let limited = gpu.render(&input, &masked, entry);
        let bright = (SIZE * SIZE - 1) as usize;
        assert!((limited[bright][0] - input[bright][0]).abs() < 0.002);
        assert!(max_difference(&limited, &full) > 0.05);
        let amount = if base == 8 { 12 } else { 22 };
        let mut zero = s;
        zero[amount] = 0;
        let neutral = gpu.render(&input, &zero, entry);
        assert!(max_difference(&neutral, &input) < 0.002);
    }
    let chained = gpu.render(&feedback, &s, "studio_prism_pass");
    let prism_only = gpu.render(&input, &s, "studio_prism_pass");
    assert!(
        max_difference(&chained, &prism_only) > 0.1,
        "Prism must retain Feedback's transformed input"
    );
    assert!(chained.iter().flatten().all(|v| v.is_finite()));
}

fn normalize_settings(size: (u32, u32)) -> [u32; 56] {
    let mut s = settings();
    s[0] = size.0;
    s[1] = size.1;
    s[6] = 1;
    s[32] = 1;
    s[33] = 1.0f32.to_bits();
    s[34] = 16.0f32.to_bits();
    s[35] = 0.5f32.to_bits();
    s
}

fn decode(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn encode(c: f32) -> f32 {
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

#[test]
fn normalize_preserves_flat_fields_black_hdr_and_zero_strength() {
    let gpu = Gpu::new();
    let s = normalize_settings((SIZE, SIZE));
    for level in [0.0, 0.001, 0.03, 0.18, 0.7, 1.25] {
        let input = vec![[level, level, level, 0.625]; (SIZE * SIZE) as usize];
        let result = gpu.normalize(&input, &s);
        assert!(
            max_difference(&input, &result) < 0.001,
            "flat {level} must retain its exposure"
        );
    }
    let input = image();
    let mut zero = s;
    zero[33] = 0;
    assert!(max_difference(&input, &gpu.normalize(&input, &zero)) < 0.002);
    let mut mixed = input;
    mixed[0] = [0.0, 0.0, 0.0, 0.625];
    mixed[1] = [2.0, 1.5, 1.0, 0.625];
    let result = gpu.normalize(&mixed, &s);
    assert_eq!(result[0], mixed[0]);
    assert_eq!(result[1], mixed[1]);
    assert!(result.iter().flatten().all(|v| v.is_finite()));
    assert!(result.iter().all(|p| p[3] == 0.625));
    let s = normalize_settings((1, 1));
    assert!(max_difference(&[[0.18; 4]], &gpu.normalize(&[[0.18; 4]], &s)) < 0.001);
}

fn exposure_scene(size: (u32, u32)) -> Vec<[f32; 4]> {
    (0..size.0 * size.1)
        .map(|i| {
            let x = (i % size.0) as f32 / size.0 as f32;
            let y = (i / size.0) as f32 / size.1 as f32;
            let texture = (x * 120.0).sin() * (y * 80.0).cos();
            if x > 0.75 {
                let v = decode(0.94 + 0.04 * texture);
                [v, v, v, 0.625]
            } else {
                let v = decode(0.14 + 0.08 * texture);
                [v, v * 0.65, v * 0.35, 0.625]
            }
        })
        .collect()
}

#[test]
fn normalize_recovers_shadow_detail_without_clipping_or_changing_color_ratios() {
    let gpu = Gpu::new();
    let size = (256, 128);
    let s = normalize_settings(size);
    let input = exposure_scene(size);
    let result = gpu.normalize(&input, &s);
    let mut shadow_before = 0.0;
    let mut shadow_after = 0.0;
    for (i, (before, after)) in input.iter().zip(&result).enumerate() {
        assert_eq!(after[3], before[3]);
        assert!(after
            .iter()
            .all(|v| v.is_finite() && *v >= 0.0 && *v <= 1.0));
        if i as u32 % size.0 < size.0 / 2 {
            shadow_before += encode(before[0]);
            shadow_after += encode(after[0]);
            if after[0] > 0.001 {
                assert!((after[1] / after[0] - 0.65).abs() < 0.003);
                assert!((after[2] / after[0] - 0.35).abs() < 0.003);
            }
            assert!(after[0] <= before[0] * 16.01);
        } else if i as u32 % size.0 > size.0 * 7 / 8 {
            assert!(
                (encode(after[0]) - encode(before[0])).abs() < 0.045,
                "bright waterfall detail must survive"
            );
        }
    }
    assert!(
        shadow_after > shadow_before * 1.3,
        "dark textured regions must become visibly clearer"
    );
    let jpeg: Vec<_> = input
        .iter()
        .map(|p| [encode(p[0]), encode(p[1]), encode(p[2]), p[3]])
        .collect();
    let mut jpeg_settings = s;
    jpeg_settings[6] = 0;
    let jpeg_result = gpu.normalize(&jpeg, &jpeg_settings);
    let expected: Vec<_> = result
        .iter()
        .map(|p| [encode(p[0]), encode(p[1]), encode(p[2]), p[3]])
        .collect();
    assert!(
        max_difference(&jpeg_result, &expected) < 0.008,
        "RAW and sRGB must receive equivalent exposure corrections"
    );
    let normalized_then_prism = gpu.render(&result, &s, "studio_prism_pass");
    let prism_only = gpu.render(&input, &s, "studio_prism_pass");
    assert!(max_difference(&normalized_then_prism, &prism_only) > 0.02);
}

#[test]
fn normalize_preview_and_export_use_the_same_spatial_scale() {
    let gpu = Gpu::new();
    let size = (512, 256);
    let large_size = (2048, 1024);
    let preview = gpu.normalize(&exposure_scene(size), &normalize_settings(size));
    let exported = gpu.normalize(&exposure_scene(large_size), &normalize_settings(large_size));
    let mut difference = 0.0;
    for y in 0..size.1 {
        for x in 0..size.0 {
            let small = preview[(y * size.0 + x) as usize][0];
            let large = exported[((y * 4) * large_size.0 + x * 4) as usize][0];
            difference += (encode(small) - encode(large)).abs();
        }
    }
    let mean = difference / (size.0 * size.1) as f32;
    assert!(mean < 0.02, "preview/export luminance drift: {mean}");
}

#[test]
fn kaleidoscope_is_a_source_stage_and_preserves_alpha() {
    let gpu = Gpu::new();
    let input = image();
    let mut s = settings();
    let neutral = gpu.render(&input, &s, "studio_kaleidoscope_pass");
    assert!(max_difference(&neutral, &input) < 0.002);
    s[38] = 8;
    s[39] = 4;
    s[40] = 3;
    s[41] = 3;
    s[42] = 2.0f32.to_bits();
    s[44] = 0.5f32.to_bits();
    s[45] = 0.5f32.to_bits();
    s[47] = 1.0f32.to_bits();
    s[48] = 2.0f32.to_bits();
    s[51] = 0.3f32.to_bits();
    for mode in 1..=6 {
        s[36] = mode;
        let result = gpu.render(&input, &s, "studio_kaleidoscope_pass");
        assert!(
            max_difference(&result, &input) > 0.02,
            "geometry mode {mode} must transform the source"
        );
        assert!(result.iter().flatten().all(|v| v.is_finite()));
        assert!(result.iter().all(|p| p[3] == 0.625));
    }
    let feedback = gpu.render(&input, &s, "studio_feedback_pass");
    let combined = gpu.render(&feedback, &s, "studio_kaleidoscope_pass");
    let geometry_only = gpu.render(&input, &s, "studio_kaleidoscope_pass");
    assert!(max_difference(&combined, &geometry_only) > 0.02);
}
