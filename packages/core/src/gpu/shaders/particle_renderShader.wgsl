struct Particle {
    spawn: vec2f,
    life: f32,
    angle: f32,
    posHistory: array<vec2f, 50>,
};

struct Camera {
  invScale: f32,
  offsetU: f32,
  offsetV: f32,
  _pad: f32,
};

@group(0) @binding(0) var<storage> particles: array<Particle>;
@group(0) @binding(1) var<uniform> deltaTime: f32;
@group(0) @binding(2) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

fn getSpeedColor(speed: f32) -> vec4f {
    let colors = array<vec4f, 12>(
      vec4f(0.031, 0.188, 0.420, 1.0),
      vec4f(0.031, 0.317, 0.611, 1.0),
      vec4f(0.000, 0.443, 0.737, 1.0),
      vec4f(0.000, 0.576, 0.800, 1.0),
      vec4f(0.000, 0.690, 0.850, 1.0),
      vec4f(0.188, 0.784, 0.886, 1.0),
      vec4f(0.498, 0.875, 0.910, 1.0),
      vec4f(0.867, 0.922, 0.769, 1.0),
      vec4f(0.976, 0.843, 0.463, 1.0),
      vec4f(0.965, 0.596, 0.282, 1.0),
      vec4f(0.902, 0.200, 0.149, 1.0),
      vec4f(1.000, 1.000, 1.000, 1.0)
    );

    const colorCount = 12u;
    let idx = u32(floor(speed * f32(colorCount - 1u)));
    let nextIdx = min(idx + 1u, colorCount - 1u);
    let localT = clamp(speed * f32(colorCount - 1u), 0.0, 1.0);
    return mix(colors[idx], colors[nextIdx], localT);
}

fn toNDC(pos: vec2f) -> vec2f {
    return vec2f(pos.x * 2.0 - 1.0, pos.y * 2.0 - 1.0);
}

@vertex
fn vs(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance: u32
) -> VertexOutput {
    let p = particles[instance];
    let segment = vertex_index / 2u;
    let pointIdx = vertex_index % 2u;
    let idx1 = segment;
    let idx2 = segment + 1u;

    let pos1 = p.posHistory[idx1];
    let pos2 = p.posHistory[idx2];

    let mapped1 = pos1 * camera.invScale + vec2f(camera.offsetU, camera.offsetV);
    let mapped2 = pos2 * camera.invScale + vec2f(camera.offsetU, camera.offsetV);

    let wrapped1x = mapped1.x - floor(mapped1.x);
    let wrapped2x = mapped2.x - floor(mapped2.x);

    let clamped1 = vec2f(wrapped1x, clamp(mapped1.y, 0.0, 1.0));
    let clamped2 = vec2f(wrapped2x, clamp(mapped2.y, 0.0, 1.0));

    var dx = clamped2.x - clamped1.x;
    if (dx > 0.5) {
      dx = dx - 1.0;
    } else if (dx < -0.5) {
      dx = dx + 1.0;
    }

    let final2_x = clamped1.x + dx;
    let final2 = vec2f(final2_x, clamped2.y);

    let ndc1 = toNDC(clamped1);
    let ndc2 = toNDC(final2);

    // Use the wrapped delta for speed (final2 - clamped1)
    var delta = final2 - clamped1;
    var speed = length(delta);
    speed = clamp(speed / deltaTime / 0.02, 0.0, 1.0);

    let ndcPos = select(ndc2, ndc1, pointIdx == 0u);
    let color = getSpeedColor(speed);
    let alpha = 1.0 - (f32(idx2) / f32(50 - 1u)) * 0.7;

    return VertexOutput(vec4f(ndcPos, 0.0, 1.0), vec4f(color.rgb, alpha));
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color.rgb * input.color.a, input.color.a);
}
