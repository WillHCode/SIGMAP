struct Particle {
    spawn: vec2f,
    life: f32,
    angle: f32,
    posHistory: array<vec2f, 50>, // TRAIL_LENGTH
};

@group(0) @binding(0) var<storage> particles: array<Particle>;
@group(0) @binding(1) var<uniform> deltaTime: f32;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

fn getSpeedColor(speed: f32) -> vec4f {
    let colors = array<vec4f, 12>(
      vec4f(0.031, 0.188, 0.420, 1.0), // very deep blue (calm)
      vec4f(0.031, 0.317, 0.611, 1.0), // deep blue
      vec4f(0.000, 0.443, 0.737, 1.0), // blue
      vec4f(0.000, 0.576, 0.800, 1.0), // light blue
      vec4f(0.000, 0.690, 0.850, 1.0), // cyan
      vec4f(0.188, 0.784, 0.886, 1.0), // bright cyan
      vec4f(0.498, 0.875, 0.910, 1.0), // pale cyan
      vec4f(0.867, 0.922, 0.769, 1.0), // very light greenish-yellow (transitional)
      vec4f(0.976, 0.843, 0.463, 1.0), // yellow-orange
      vec4f(0.965, 0.596, 0.282, 1.0), // orange
      vec4f(0.902, 0.200, 0.149, 1.0), // red
      vec4f(1.000, 1.000, 1.000, 1.0)  // white (extreme currents)
    );


    const colorCount = 12u;
    let idx = u32(floor(speed * f32(colorCount - 1u)));
    let nextIdx = min(idx + 1u, colorCount - 1u);
    let localT = clamp(speed * f32(colorCount - 1u), 0.0, 1.0);

    let c1 = colors[idx];
    let c2 = colors[nextIdx];
    return mix(c1, c2, localT);
}

fn toNDC(pos: vec2f) -> vec2f {
    return vec2f(
        pos.x * 2.0 - 1.0,
        pos.y * 2.0 - 1.0
    );
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

    let adjustedPos1 = pos1;
    let adjustedPos2 = pos2;

    var delta = pos2 - pos1;
    var speed = length(delta);

    // clamp speed between 0 and 1
    speed = clamp(speed / deltaTime / 0.02  , 0.0, 1.0); // SIMULATION_SPEED = 0.02

    let ndcPos = select(toNDC(adjustedPos2), toNDC(adjustedPos1), pointIdx == 0u);

    //let color = vec3f(1.0, 0.0, 0.0);
    let color = getSpeedColor(speed);

    let alpha = 1.0 - (f32(idx2) / f32(50 - 1u)) * 0.7; // TRAIL_LENGTH = 50; TRAIL_FADE = 0.7
    return VertexOutput(
        vec4f(ndcPos, 0.0, 1.0),
        vec4f(color.rgb, alpha)
    );
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color.rgb * input.color.a, input.color.a);
}
