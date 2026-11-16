struct KaleidoscopeGpu {
    mode: u32,
    axis: u32,
    segments: u32,
    grid: u32,
    depth: u32,
    polygon_sides: u32,
    mirror_size: f32,
    _pad2: u32,
    center_x: f32,
    center_y: f32,
    rotation: f32,
    zoom: f32,
    twist: f32,
    edge_blur: f32,
    edge_vignette: f32,
    edge_width: f32,
    edge_color: vec4<f32>,
}

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
    kaleidoscope: KaleidoscopeGpu,
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

fn studio_decode(value: vec3<f32>) -> vec3<f32> {
    let c = max(value, vec3<f32>(0.0));
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn studio_encode(value: vec3<f32>) -> vec3<f32> {
    let c = max(value, vec3<f32>(0.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}

fn studio_linear(source: vec3<f32>) -> vec3<f32> {
    if (params.grid.flags != 0u) { return max(source, vec3<f32>(0.0)); }
    return studio_decode(source);
}

@compute @workgroup_size(8, 8, 1)
fn studio_normalize_down(@builtin(global_invocation_id) id: vec3<u32>) {
    if (outside(id)) { return; }
    let start = id.xy * params.grid.src / params.grid.dst;
    let end = min(max((id.xy + 1u) * params.grid.src / params.grid.dst, start + 1u), params.grid.src);
    var sum = 0.0;
    for (var y = start.y; y < end.y; y += 1u) {
        for (var x = start.x; x < end.x; x += 1u) {
            let linear = studio_linear(textureLoad(t0, vec2<u32>(x, y), 0).rgb);
            sum += min(studio_encode(vec3<f32>(studio_luma(linear))).x, 1.0);
        }
    }
    let value = sum / f32((end.x - start.x) * (end.y - start.y));
    textureStore(out_f32, id.xy, vec4<f32>(value, value, 0.0, 0.0));
}

fn studio_normalize_range(id: vec3<u32>, direction: vec2<i32>) {
    if (outside(id)) { return; }
    let last = vec2<i32>(params.grid.dst) - 1;
    let radius = i32(params.grid.radius);
    var low = 1.0;
    var high = 0.0;
    for (var k = -radius; k <= radius; k += 1) {
        let point = clamp(vec2<i32>(id.xy) + direction * k, vec2<i32>(0), last);
        let value = textureLoad(t0, point, 0).xy;
        low = min(low, value.x);
        high = max(high, value.y);
    }
    textureStore(out_f32, id.xy, vec4<f32>(low, high, 0.0, 0.0));
}

@compute @workgroup_size(8, 8, 1)
fn studio_normalize_range_h(@builtin(global_invocation_id) id: vec3<u32>) {
    studio_normalize_range(id, vec2<i32>(1, 0));
}

@compute @workgroup_size(8, 8, 1)
fn studio_normalize_range_v(@builtin(global_invocation_id) id: vec3<u32>) {
    studio_normalize_range(id, vec2<i32>(0, 1));
}

fn studio_local_normalize(uv: vec2<f32>, source: vec3<f32>, effect: LocalNormalizeGpu) -> vec3<f32> {
    if (effect.amount < 0.0001) { return source; }
    let linear = studio_linear(source);
    let luma = studio_luma(linear);
    if (luma <= 0.000001 || luma >= 1.0) { return source; }
    let range = tap_sample(t1, tap_uv(uv, textureDimensions(t1))).xy;
    let mean = tap_sample(t2, tap_uv(uv, textureDimensions(t2))).x;
    let span = max(range.y - range.x, 0.0);
    let strength = effect.amount * smoothstep(0.01, 0.08, span);
    if (strength <= 0.0) { return source; }
    let original = studio_encode(vec3<f32>(luma)).x;
    let low = clamp(9.0 * range.x - 8.0 * mean, 0.0, 1.0);
    let high = clamp(9.0 * range.y - 8.0 * mean, low, 1.0);
    let normalized = clamp(low + (original - range.x) * (high - low) / max(span, 0.0001), 0.0, 1.0);
    let highlight_weight = 1.0 - smoothstep(0.65, 1.0, original);
    let mapped = mix(original, normalized, strength * highlight_weight * highlight_weight);
    let mapped_luma = studio_decode(vec3<f32>(mapped)).x;
    var gain = clamp(mapped_luma / luma, 1.0 / 16.0, 16.0);
    gain = min(gain, max(1.0, 1.0 / max(max(linear.r, linear.g), linear.b)));
    let adjusted = linear * gain;
    if (params.grid.flags != 0u) { return adjusted; }
    return studio_encode(adjusted);
}

fn studio_write(id: vec3<u32>, kind: u32) {
    if (outside(id)) { return; }
    let dims = vec2<f32>(params.grid.dst);
    let uv = (vec2<f32>(id.xy) + 0.5) / dims;
    let source = textureLoad(t0, id.xy, 0);
    var color = source.rgb;
    if (kind == 1u) {
        color = studio_feedback(uv, dims, color, params.feedback);
    } else {
        color = studio_prism(uv, dims, color, params.prism);
    }
    textureStore(out_f16, id.xy, vec4<f32>(color, source.a));
}
@compute @workgroup_size(8, 8, 1)
fn studio_normalize(@builtin(global_invocation_id) id: vec3<u32>) {
    if (outside(id)) { return; }
    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(params.grid.dst);
    let source = textureLoad(t0, id.xy, 0);
    let color = studio_local_normalize(uv, source.rgb, params.local_normalize);
    textureStore(out_f16, id.xy, vec4<f32>(color, source.a));
}
@compute @workgroup_size(8, 8, 1)
fn studio_feedback_pass(@builtin(global_invocation_id) id: vec3<u32>) { studio_write(id, 1u); }
@compute @workgroup_size(8, 8, 1)
fn studio_prism_pass(@builtin(global_invocation_id) id: vec3<u32>) { studio_write(id, 2u); }

fn kaleidoscope_map(pixel: vec2<u32>, size: vec2<f32>, k: KaleidoscopeGpu) -> vec3<f32> {
    let center = vec2<f32>(k.center_x, k.center_y);
    let aspect = size / min(size.x, size.y);
    let cosine = cos(k.rotation);
    let sine = sin(k.rotation);
    let uv = (vec2<f32>(pixel) + 0.5) / size;
    let relative = (uv - vec2<f32>(0.5)) * aspect;
    var p = vec2<f32>(
        relative.x * cosine + relative.y * sine,
        -relative.x * sine + relative.y * cosine
    );
    var edge_distance = 1.0;
    if (k.mode == 1u || k.mode == 4u || k.mode == 5u) {
        var radius = length(p);
        var theta = atan2(p.y, p.x);
        let wedge = 6.28318530718 / f32(max(k.segments, 2u));
        if (k.mode == 4u) {
            theta -= k.twist * log(1.0 + radius * 4.0);
        }
        let phase = abs(fract(theta / wedge + 0.5) - 0.5);
        edge_distance = min(phase, 0.5 - phase) * 2.0;
        let folded = phase * wedge;
        if (k.mode == 5u) {
            for (var d = 1u; d < 6u; d += 1u) {
                if (d >= k.depth) { break; }
                radius = abs(fract(radius * 2.0) * 2.0 - 1.0);
            }
        }
        p = radius * vec2<f32>(cos(folded), sin(folded));
    } else if (k.mode == 2u) {
        if (k.axis == 0u || k.axis == 2u) { p.y = abs(p.y); }
        if (k.axis == 1u || k.axis == 2u) { p.x = abs(p.x); }
        if (k.axis == 3u) {
            p = vec2<f32>(max(p.x, p.y), min(p.x, p.y));
        }
        edge_distance = min(abs(p.x), abs(p.y)) * 2.0;
    } else if (k.mode == 3u) {
        let tiles = f32(max(k.grid, 2u));
        let tiled = abs(p / aspect) * tiles;
        let cell = floor(tiled);
        var sub = fract(tiled);
        if (i32(cell.x) % 2 != 0) { sub.x = 1.0 - sub.x; }
        if (i32(cell.y) % 2 != 0) { sub.y = 1.0 - sub.y; }
        edge_distance = min(min(sub.x, 1.0 - sub.x), min(sub.y, 1.0 - sub.y)) * 2.0;
        return vec3<f32>(
            clamp(center + sub * (0.5 / max(k.zoom, 0.25)), vec2<f32>(0.0), vec2<f32>(1.0)),
            edge_distance
        );

    } else if (k.mode == 6u) {
        let density = 3.0 / max(k.mirror_size, 0.25);
        let q = p * density;
        if (k.polygon_sides == 3u) {
            var v = 1.15470053838 * q.y;
            var u = q.x - 0.5 * v;
            let tile = round(vec2<f32>((2.0 * u + v) / 3.0, (u + 2.0 * v) / 3.0));
            u -= 2.0 * tile.x - tile.y;
            v -= 2.0 * tile.y - tile.x;
            for (var i = 0u; i < 6u; i += 1u) {
                if (u < 0.0) {
                    let previous_u = u;
                    u = -previous_u;
                    v += previous_u;
                } else if (v < 0.0) {
                    let previous_v = v;
                    v = -previous_v;
                    u += previous_v;
                } else if (u + v > 1.0) {
                    let previous_u = u;
                    u = 1.0 - v;
                    v = 1.0 - previous_u;
                } else {
                    break;
                }
            }
            edge_distance = 3.0 * min(min(u, v), max(0.0, 1.0 - u - v));
            p = vec2<f32>(u + 0.5 * v, 0.86602540378 * v) / density;
        } else if (k.polygon_sides == 4u) {
            let tiled = abs(q);
            let cell = floor(tiled);
            var sub = fract(tiled);
            if (i32(cell.x) % 2 != 0) { sub.x = 1.0 - sub.x; }
            if (i32(cell.y) % 2 != 0) { sub.y = 1.0 - sub.y; }
            edge_distance = min(min(sub.x, 1.0 - sub.x), min(sub.y, 1.0 - sub.y)) * 2.0;
            p = sub / density;
        } else {
            let axial_v = q.y * 1.15470053838;
            let axial_u = q.x - 0.5 * axial_v;
            let cube = vec3<f32>(axial_u, -axial_u - axial_v, axial_v);
            var rounded = round(cube);
            let difference = abs(rounded - cube);
            if (difference.x > difference.y && difference.x > difference.z) {
                rounded.x = -rounded.y - rounded.z;
            } else if (difference.y > difference.z) {
                rounded.y = -rounded.x - rounded.z;
            } else {
                rounded.z = -rounded.x - rounded.y;
            }
            let cell_center = vec2<f32>(rounded.x + 0.5 * rounded.z, 0.86602540378 * rounded.z);
            let local = q - cell_center;
            let wedge = 6.28318530718 / f32(k.polygon_sides);
            let angle = atan2(local.y, local.x);
            let phase = abs(fract(angle / wedge + 0.5) - 0.5);
            edge_distance = min(phase, 0.5 - phase) * 2.0;
            p = length(local) * vec2<f32>(cos(phase * wedge), sin(phase * wedge)) / density;
        }
    }
    let restored = vec2<f32>(
        p.x * cosine - p.y * sine,
        p.x * sine + p.y * cosine
    );
    return vec3<f32>(
        clamp(center + restored / (aspect * max(k.zoom, 0.25)), vec2<f32>(0.0), vec2<f32>(1.0)),
        edge_distance
    );
}

fn kaleidoscope_bilinear(uv: vec2<f32>, size: vec2<f32>) -> vec4<f32> {
    let pos = uv * size - 0.5;
    let whole = floor(pos);
    let frac = clamp(pos - whole, vec2<f32>(0.0), vec2<f32>(1.0));
    let limit = vec2<i32>(size) - 1;
    let p00 = clamp(vec2<i32>(whole), vec2<i32>(0), limit);
    let p10 = clamp(vec2<i32>(whole) + vec2<i32>(1, 0), vec2<i32>(0), limit);
    let p01 = clamp(vec2<i32>(whole) + vec2<i32>(0, 1), vec2<i32>(0), limit);
    let p11 = clamp(vec2<i32>(whole) + vec2<i32>(1, 1), vec2<i32>(0), limit);
    return mix(
        mix(textureLoad(t0, p00, 0), textureLoad(t0, p10, 0), frac.x),
        mix(textureLoad(t0, p01, 0), textureLoad(t0, p11, 0), frac.x),
        frac.y
    );
}

@compute @workgroup_size(8, 8, 1)
fn studio_kaleidoscope_pass(@builtin(global_invocation_id) id: vec3<u32>) {
    if (outside(id)) { return; }
    let k = params.kaleidoscope;
    if (k.mode == 0u) {
        textureStore(out_f16, id.xy, textureLoad(t0, id.xy, 0));
        return;
    }
    let dims = vec2<f32>(params.grid.dst);
    let mapped = kaleidoscope_map(id.xy, dims, k);
    var source = kaleidoscope_bilinear(mapped.xy, dims);
    let edge = 1.0 - smoothstep(0.0, max(0.001, k.edge_width), mapped.z);
    if (k.edge_blur > 0.0 && edge > 0.001) {
        let radius = k.edge_blur * edge * 16.0 * min(dims.x, dims.y) / 1080.0;
        let dx = vec2<f32>(radius / dims.x, 0.0);
        let dy = vec2<f32>(0.0, radius / dims.y);
        let blurred = (source * 4.0
            + kaleidoscope_bilinear(mapped.xy - dx, dims)
            + kaleidoscope_bilinear(mapped.xy + dx, dims)
            + kaleidoscope_bilinear(mapped.xy - dy, dims)
            + kaleidoscope_bilinear(mapped.xy + dy, dims)) * 0.125;
        source = mix(source, blurred, edge * k.edge_blur);
    }
    var edge_color = k.edge_color.rgb;
    if (params.grid.flags != 0u) { edge_color = studio_decode(edge_color); }
    let color = mix(source.rgb, edge_color, clamp(edge * k.edge_vignette, 0.0, 1.0));
    textureStore(out_f16, id.xy, vec4<f32>(color, source.a));
}
