fn main() {
    let source = include_str!("../../../src-tauri/src/shaders/shader.wgsl");
    let module = naga::front::wgsl::parse_str(source)
        .unwrap_or_else(|error| panic!("WGSL parse error:\n{}", error.emit_to_string(source)));
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .unwrap_or_else(|error| panic!("WGSL validation error:\n{}", error.emit_to_string(source)));
    println!("WGSL shader parsing and validation passed");
}
