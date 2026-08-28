fn main() {
    // The .ico is embedded into the Windows binary at compile time, but tauri_build
    // does not watch it — without this, regenerating icons never triggers a rebuild.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
