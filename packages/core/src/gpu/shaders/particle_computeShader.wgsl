struct Particle {
    spawn: vec2f,
    life: f32,
    angle: f32,
    posHistory: array<vec2f, 50>, // TRAIL_LENGTH
};

struct Params {
    deltaTime: f32,
    seed: u32,
};

@group(0) @binding(0) var<storage, read> inputParticles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> outputParticles: array<Particle>;
@group(0) @binding(2) var windTexture: texture_2d<f32>;
@group(0) @binding(3) var<storage,read_write> params: Params;

const MAX_LIFETIME: f32 = 10; // MAX_LIFETIME = 10
const TRAIL_LENGTH: u32 = 50u; // TRAIL_LENGTH = 50

fn random() -> f32 {
    params.seed = (params.seed * 48271u) % 2147483647u;
    return f32(params.seed) / 2147483647.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let i = global_id.x;
    if (i >= 100000u) { return; } // NUM_PARTICLES = 100000

    var p = inputParticles[i];
    var pos = p.posHistory[0];

    // Sample wind texture
    let texCoord = vec2u(u32(pos.x * 4320.0), u32(pos.y * 2041.0)); //dataRows ; dataCols
    let wind = textureLoad(windTexture, texCoord, 0).xy;

    // Update position
    pos = pos + wind * params.deltaTime * 0.02 ; // SIMULATION_SPEED = 0.02

    // Shift position history
    for (var j = TRAIL_LENGTH - 1; j > 0; j--) {
        p.posHistory[j] = p.posHistory[j - 1];
    }
    p.posHistory[0] = pos;

    // Update life and angle
    var newLife = p.life - params.deltaTime;
    let newAngle = atan2(wind.y, wind.x);

    if (newLife <= 0.0) {
        // Respawn particle
        pos = p.spawn;
        //pos = vec2f( random() * 2.0 - 1.0, random() * 2.0 - 1.0);
        newLife = random() * MAX_LIFETIME;

        // Reset position history
        for (var j: u32 = 0u; j < TRAIL_LENGTH; j++) {
            p.posHistory[j] = pos;
        }
    }

    outputParticles[i] = Particle(
        p.spawn,
        newLife,
        newAngle,
        p.posHistory
    );
}
