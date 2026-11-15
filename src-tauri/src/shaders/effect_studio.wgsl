struct FractalFeedbackGpu {
    enabled: u32,
    iterations: u32,
    scale: f32,
    rotation: f32,
    amount: f32,
    decay: f32,
    low: f32,
    high: f32,
    feather: f32,
    blur: f32,
    luminance_enabled: u32,
    _pad1: f32,
}
struct PrismGpu {
    enabled: u32,
    mode: u32,
    amount: f32,
    separation: f32,
    angle: f32,
    refraction: f32,
    low: f32,
    high: f32,
    feather: f32,
    blur: f32,
    luminance_enabled: u32,
    _pad1: f32,
}
struct LocalNormalizeGpu {
    enabled: u32,
    amount: f32,
    radius: f32,
    smoothing: f32,
}

struct Params {
    grid: Grid,
    feedback: FractalFeedbackGpu,
    prism: PrismGpu,
    local_normalize: LocalNormalizeGpu,
}
@group(0) @binding(7) var<uniform> params: Params;

fn studio_luma(color: vec3<f32>) -> f32 {
    return dot(max(color, vec3<f32>(0.0)), vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn studio_mask(luma: f32, low: f32, high: f32, feather: f32) -> f32 {
    let edge = max(0.001, feather);
    var coverage = 1.0;
    if (low > 0.0) { coverage *= smoothstep(low - edge, low, luma); }
    if (high < 1.0) { coverage *= 1.0 - smoothstep(high, high + edge, luma); }
    return coverage;
}

fn studio_fetch(uv: vec2<f32>, dims: vec2<f32>) -> vec3<f32> {
    return tap_sample(t0, tap_uv(uv, vec2<u32>(dims))).rgb;
}

fn studio_blur(uv: vec2<f32>, dims: vec2<f32>, radius: f32) -> vec3<f32> {
    if (radius <= 0.0) { return studio_fetch(uv, dims); }
    let limit = vec2<i32>(dims) - vec2<i32>(1);
    let center = vec2<i32>(clamp(uv * dims, vec2<f32>(0.0), dims - vec2<f32>(1.0)));
    let shift = i32(max(radius * min(dims.x, dims.y) / 1080.0, 1.0));
    let original = textureLoad(t0, center, 0).rgb;
    let right = textureLoad(t0, clamp(center + vec2<i32>(shift, 0), vec2<i32>(0), limit), 0).rgb;
    let left = textureLoad(t0, clamp(center - vec2<i32>(shift, 0), vec2<i32>(0), limit), 0).rgb;
    let down = textureLoad(t0, clamp(center + vec2<i32>(0, shift), vec2<i32>(0), limit), 0).rgb;
    let up = textureLoad(t0, clamp(center - vec2<i32>(0, shift), vec2<i32>(0), limit), 0).rgb;
    return (original * 4.0 + right + left + down + up) * 0.125;
}

fn studio_feedback(
    uv: vec2<f32>, dims: vec2<f32>, source: vec3<f32>, effect: FractalFeedbackGpu
) -> vec3<f32> {
    var coverage = 1.0;
    if (effect.luminance_enabled != 0u) {
        coverage = studio_mask(studio_luma(source), effect.low, effect.high, effect.feather);
    }
    if (coverage * effect.amount < 0.0001) { return source; }
    let ca = cos(effect.rotation);
    let sa = sin(effect.rotation);
    var position = uv;
    var sum = vec3<f32>(0.0);
    var weight = 1.0;
    var total = 0.0;
    for (var i = 0u; i < 7u; i += 1u) {
        if (i >= effect.iterations) { break; }
        let p = (position - vec2<f32>(0.5)) * effect.scale;
        position = vec2<f32>(0.5) + vec2<f32>(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
        sum += studio_blur(position, dims, effect.blur) * weight;
        total += weight;
        weight *= effect.decay;
    }
    return mix(source, sum / max(total, 0.0001), effect.amount * coverage);
}

fn studio_prism(
    uv: vec2<f32>, dims: vec2<f32>, source: vec3<f32>, effect: PrismGpu
) -> vec3<f32> {
    var coverage = 1.0;
    if (effect.luminance_enabled != 0u) {
        coverage = studio_mask(studio_luma(source), effect.low, effect.high, effect.feather);
    }
    if (coverage * effect.amount < 0.0001) { return source; }
    let direction = vec2<f32>(cos(effect.angle), sin(effect.angle));
    let offset = direction * (effect.separation * min(dims.x, dims.y) / 1080.0) / dims;
    var base_uv = uv;
    if (effect.mode == 2u) {
        let relative = uv - vec2<f32>(0.5);
        let dist = length(relative);
        base_uv += relative * effect.refraction * 0.3 * sin(dist * 25.0);
    }
    let red = studio_fetch(base_uv + offset, dims).r;
    let green = studio_fetch(base_uv, dims).g;
    let blue = studio_fetch(base_uv - offset, dims).b;
    var prism_color = vec3<f32>(red, green, blue);
    if (effect.blur > 0.0) {
        let blurred = studio_blur(base_uv, dims, effect.blur);
        prism_color = mix(prism_color, blurred, 0.5);
    }
    return mix(source, prism_color, effect.amount * coverage);
}

fn studio_local_normalize(
    uv: vec2<f32>, dims: vec2<f32>, source: vec3<f32>, effect: LocalNormalizeGpu
) -> vec3<f32> {
    if (effect.amount < 0.0001) { return source; }
    let limit = vec2<i32>(dims) - vec2<i32>(1);
    let center = vec2<i32>(clamp(uv * dims, vec2<f32>(0.0), dims - vec2<f32>(1.0)));
    let radius = i32(max(effect.radius * min(dims.x, dims.y) / 1080.0, 1.0));
    var mean = 0.0;
    var second = 0.0;
    for (var y = -1; y <= 1; y += 1) {
        for (var x = -1; x <= 1; x += 1) {
            let position = clamp(center + vec2<i32>(x, y) * radius, vec2<i32>(0), limit);
            let value = studio_luma(textureLoad(t0, position, 0).rgb);
            mean += value;
            second += value * value;
        }
    }
    mean /= 9.0;
    let sigma = sqrt(max(0.0, second / 9.0 - mean * mean));
    let original = studio_luma(source);
    let target_luma = clamp(0.5 + (original - mean) * 0.16 / max(sigma, 0.04), 0.0, 1.0);
    let strength = effect.amount * (1.0 - effect.smoothing * 0.45);
    let adjusted = mix(original, target_luma, strength);
    return source * (adjusted / max(original, 0.001));
}


fn studio_write(id: vec3<u32>, kind: u32) {
    if (outside(id)) { return; }
    let dims = vec2<f32>(params.grid.dst);
    let uv = (vec2<f32>(id.xy) + 0.5) / dims;
    let source = textureLoad(t0, id.xy, 0);
    var color = source.rgb;
    if (kind == 0u) {
        color = studio_local_normalize(uv, dims, color, params.local_normalize);
    } else if (kind == 1u) {
        color = studio_feedback(uv, dims, color, params.feedback);
    } else {
        color = studio_prism(uv, dims, color, params.prism);
    }
    textureStore(out_f16, id.xy, vec4<f32>(color, source.a));
}
@compute @workgroup_size(8, 8, 1)
fn studio_normalize(@builtin(global_invocation_id) id: vec3<u32>) { studio_write(id, 0u); }
@compute @workgroup_size(8, 8, 1)
fn studio_feedback_pass(@builtin(global_invocation_id) id: vec3<u32>) { studio_write(id, 1u); }
@compute @workgroup_size(8, 8, 1)
fn studio_prism_pass(@builtin(global_invocation_id) id: vec3<u32>) { studio_write(id, 2u); }
