use crate::gpu_compute::{Bind, ComputeEncoder, Grid, Group, IMAGE_FORMAT, Out, Slot, Tex};
use crate::image_processing::{
    FractalFeedbackGpu, GlobalAdjustments, GpuContext, LocalNormalizeGpu, PrismGpu,
};

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Params {
    grid: Grid,
    feedback: FractalFeedbackGpu,
    prism: PrismGpu,
    local_normalize: LocalNormalizeGpu,
}

impl Params {
    pub fn new(size: (u32, u32), adjustments: &GlobalAdjustments) -> Option<Self> {
        let params = Self {
            grid: Grid {
                flags: adjustments.is_raw_image,
                ..Grid::new(size)
            },
            feedback: adjustments.feedback,
            prism: adjustments.prism,
            local_normalize: adjustments.local_normalize,
        };
        params
            .stages()
            .iter()
            .any(|(_, active)| *active)
            .then_some(params)
    }

    fn stages(&self) -> [(&'static str, bool); 3] {
        [
            (
                "studio_normalize",
                self.local_normalize.enabled == 1 && self.local_normalize.amount > 0.0,
            ),
            (
                "studio_feedback_pass",
                self.feedback.enabled == 1 && self.feedback.amount > 0.0,
            ),
            (
                "studio_prism_pass",
                self.prism.enabled == 1 && self.prism.amount > 0.0,
            ),
        ]
    }

    pub fn key(&self, source_id: u64) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        source_id.hash(&mut hasher);
        bytemuck::bytes_of(self).hash(&mut hasher);
        hasher.finish()
    }
}

pub fn render(
    context: &GpuContext,
    source: &wgpu::TextureView,
    params: &Params,
) -> Result<Slot, String> {
    let size = (params.grid.dst[0], params.grid.dst[1]);
    crate::gpu_compute::encode(context, |enc| {
        let mut current = None;
        for (entry, active) in params.stages() {
            if !active {
                continue;
            }
            let output = enc.texture("Effect Studio", size, IMAGE_FORMAT);
            let input = current
                .as_ref()
                .map_or(source, |image: &crate::gpu_compute::Tex| &image.view);
            let mut inputs = vec![input];
            let maps = (entry == "studio_normalize").then(|| normalize_maps(enc, input, params));
            if let Some((range, mean)) = maps.as_ref() {
                inputs.extend([&range.view, &mean.view]);
            }
            enc.run(
                Group::Studio,
                entry,
                params,
                size,
                &inputs,
                Out::F16(&output.view),
                Bind::default(),
            );
            current = Some(output);
        }
        current.expect("active studio stage").detach()
    })
}

fn normalize_maps(
    enc: &mut ComputeEncoder<'_>,
    input: &wgpu::TextureView,
    params: &Params,
) -> (Tex, Tex) {
    let size = (params.grid.dst[0], params.grid.dst[1]);
    let scale = (1024.0 / size.0.max(size.1) as f32).min(1.0);
    let map_size = (
        (size.0 as f32 * scale).round().max(1.0) as u32,
        (size.1 as f32 * scale).round().max(1.0) as u32,
    );
    let short_side = map_size.0.min(map_size.1) as f32;
    let map_params = Params {
        grid: Grid {
            radius: (params.local_normalize.radius * short_side / 1080.0)
                .round()
                .max(1.0) as u32,
            flags: params.grid.flags,
            ..Grid::new(map_size).with_src(size)
        },
        ..*params
    };
    let luma = enc.texture(
        "Normalize luminance",
        map_size,
        wgpu::TextureFormat::Rgba32Float,
    );
    enc.run(
        Group::Studio,
        "studio_normalize_down",
        &map_params,
        map_size,
        &[input],
        Out::F32(&luma.view),
        Bind::default(),
    );
    let horizontal = enc.texture(
        "Normalize range",
        map_size,
        wgpu::TextureFormat::Rgba32Float,
    );
    let range = enc.texture(
        "Normalize range",
        map_size,
        wgpu::TextureFormat::Rgba32Float,
    );
    for (entry, input, output) in [
        ("studio_normalize_range_h", &luma.view, &horizontal.view),
        ("studio_normalize_range_v", &horizontal.view, &range.view),
    ] {
        enc.run(
            Group::Studio,
            entry,
            &map_params,
            map_size,
            &[input],
            Out::F32(output),
            Bind::default(),
        );
    }
    // Two box passes approximate Gaussian smoothing on bounded-size maps.
    let radius = ((0.01 + 0.06 * params.local_normalize.smoothing) * short_side * 1.225)
        .round()
        .max(1.0) as u32;
    (
        enc.blur(range, radius, 2, 0),
        enc.blur(luma, radius.div_ceil(2), 2, 0),
    )
}
