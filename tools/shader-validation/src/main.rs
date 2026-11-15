fn validate(name: &str, source: &str) {
    let module = naga::front::wgsl::parse_str(source)
        .unwrap_or_else(|error| panic!("{name} parse error:\n{}", error.emit_to_string(source)));
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .unwrap_or_else(|error| panic!("{name} validation error:\n{}", error.emit_to_string(source)));
    println!("{name} parsing and validation passed");
}

fn main() {
    let main = include_str!("../../../src-tauri/src/shaders/shader.wgsl");
    validate("Main WGSL", main);
    validate(
        "High-precision WGSL",
        &main.replace("rgba8unorm, write>", "rgba16float, write>"),
    );
    let studio = format!(
        "{}\n{}",
        include_str!("../../../src-tauri/src/shaders/effect_studio.wgsl"),
        include_str!("../../../src-tauri/src/shaders/compute_common.wgsl")
    );
    validate("Effect Studio WGSL", &studio);
}
