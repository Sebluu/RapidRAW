use crate::gpu_compute::{Bind, Grid, Group, IMAGE_FORMAT, Out, Slot};
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
            grid: Grid::new(size),
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
            enc.run(
                Group::Studio,
                entry,
                params,
                size,
                &[current
                    .as_ref()
                    .map_or(source, |image: &crate::gpu_compute::Tex| &image.view)],
                Out::F16(&output.view),
                Bind::default(),
            );
            current = Some(output);
        }
        current.expect("active studio stage").detach()
    })
}
