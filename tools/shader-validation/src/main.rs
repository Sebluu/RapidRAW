fn validate(name: &str, source: &str) {
    let module = naga::front::wgsl::parse_str(source)
        .unwrap_or_else(|error| panic!("{name} parse error:\n{}", error.emit_to_string(source)));
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .unwrap_or_else(|error| panic!("{name} validation error:\n{}", error.emit_to_string(source)));
    if name != "Effect Studio WGSL" {
        let harmony = module.types.iter().find_map(|(_, ty)| {
            if ty.name.as_deref() == Some("ColorHarmony") {
                Some(&ty.inner)
            } else {
                None
            }
        });
        let Some(naga::TypeInner::Struct { members, span }) = harmony else {
            panic!("ColorHarmony layout is missing");
        };
        assert_eq!(*span, 64);
        assert_eq!(
            members
                .iter()
                .map(|member| member.offset)
                .collect::<Vec<_>>(),
            [0, 16, 32, 48, 52]
        );
    }
    println!("{name}: shader validation and ColorHarmony layout passed");
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
