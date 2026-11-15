use half::f16;
use wgpu::util::DeviceExt;

const SIZE: u32 = 16;
const ROW: u32 = 256;

struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    shader: wgpu::ShaderModule,
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
            let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("Effect Studio test"),
                source: wgpu::ShaderSource::Wgsl(
                    format!(
                        "{}\n{}",
                        include_str!("../../../src-tauri/src/shaders/effect_studio.wgsl"),
                        include_str!("../../../src-tauri/src/shaders/compute_common.wgsl")
                    )
                    .into(),
                ),
            });
            Self {
                device,
                queue,
                shader,
            }
        })
    }

    fn render(&self, image: &[[f32; 4]], settings: &[u32; 36], entry: &str) -> Vec<[f32; 4]> {
        let texture = |usage| {
            self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Studio test image"),
                size: wgpu::Extent3d {
                    width: SIZE,
                    height: SIZE,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba16Float,
                usage,
                view_formats: &[],
            })
        };
        let input = texture(wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING);
        let output = texture(wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::STORAGE_BINDING);
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
                bytes_per_row: Some(SIZE * 8),
                rows_per_image: Some(SIZE),
            },
            input.size(),
        );
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
                module: &self.shader,
                entry_point: Some(entry),
                compilation_options: Default::default(),
                cache: None,
            });
        let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(
                        &input.create_view(&Default::default()),
                    ),
                },
                wgpu::BindGroupEntry {
                    binding: 7,
                    resource: params.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 9,
                    resource: wgpu::BindingResource::TextureView(
                        &output.create_view(&Default::default()),
                    ),
                },
            ],
        });
        let readback = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: (ROW * SIZE) as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_compute_pass(&Default::default());
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &group, &[]);
            pass.dispatch_workgroups(SIZE.div_ceil(8), SIZE.div_ceil(8), 1);
        }
        encoder.copy_texture_to_buffer(
            output.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(ROW),
                    rows_per_image: Some(SIZE),
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
            .chunks_exact(ROW as usize)
            .flat_map(|row| {
                row[..SIZE as usize * 8].chunks_exact(8).map(|px| {
                    std::array::from_fn(|i| f16::from_le_bytes([px[i * 2], px[i * 2 + 1]]).to_f32())
                })
            })
            .collect();
        drop(mapping);
        readback.unmap();
        result
    }
}

fn settings() -> [u32; 36] {
    let mut s = [0; 36];
    s[0] = SIZE;
    s[1] = SIZE;
    // Grid (32 bytes), Feedback (48), Prism (48), Local Normalize (16).
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
