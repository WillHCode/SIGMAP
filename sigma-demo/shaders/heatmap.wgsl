@group(0) @binding(0) var<storage, read> inputPoints: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read_write> outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  textureStore(outputTexture, vec2<i32>(id.xy), vec4<f32>(0.0, 1.0, 0.0, 1.0));
}
