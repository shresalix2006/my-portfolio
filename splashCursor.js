/* ============================================
   SPLASH CURSOR - STABLE FLUID ENGINE (FIXED)
   ============================================ */

function initSplashCursor(canvas, customConfig = {}) {
  if (!canvas) return;

  const config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024, // Lowered for stability
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 3.5,
    VELOCITY_DISSIPATION: 2,
    PRESSURE: 0.1,
    PRESSURE_ITERATIONS: 20,
    CURL: 3,
    SPLAT_RADIUS: 0.2,
    SPLAT_FORCE: 6000,
    SHADING: true,
    RAINBOW_MODE: true,
    COLOR: '#ff0000',
    ...customConfig
  };

  let gl;
  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  gl = canvas.getContext('webgl2', params);
  if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

  // CRITICAL: Ensure clear color is set to transparent black
  gl.clearColor(0, 0, 0, 0);

  const isWebGL2 = !!gl.renderbufferStorageMultisample;
  let ext;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    ext = { 
      supportLinearFiltering: gl.getExtension('OES_texture_float_linear'), 
      halfFloatTexType: gl.HALF_FLOAT, 
      formatRGBA: { internalFormat: gl.RGBA16F, format: gl.RGBA }, 
      formatRG: { internalFormat: gl.RG16F, format: gl.RG }, 
      formatR: { internalFormat: gl.R16F, format: gl.RED } 
    };
  } else {
    let halfFloat = gl.getExtension('OES_texture_half_float');
    ext = { 
      supportLinearFiltering: gl.getExtension('OES_texture_half_float_linear'), 
      halfFloatTexType: halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE, 
      formatRGBA: { internalFormat: gl.RGBA, format: gl.RGBA }, 
      formatRG: { internalFormat: gl.RGBA, format: gl.RGBA }, 
      formatR: { internalFormat: gl.RGBA, format: gl.RGBA } 
    };
  }

  function compileShader(type, source, keywords = []) {
    let head = keywords.map(k => `#define ${k}\n`).join('');
    const s = gl.createShader(type);
    gl.shaderSource(s, head + source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  
  function createProgram(vs, fs) {
    const p = gl.createProgram(); 
    gl.attachShader(p, vs); 
    gl.attachShader(p, fs); 
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
    const u = {}; 
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) { 
      let n = gl.getActiveUniform(p, i).name; 
      u[n] = gl.getUniformLocation(p, n); 
    }
    return { p, u, bind() { gl.useProgram(p); } };
  }

  // Force highp everywhere to avoid noise on different GPUs
  const baseVS = compileShader(gl.VERTEX_SHADER, `
    precision highp float; 
    attribute vec2 aPosition; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform vec2 texelSize; 
    void main(){ 
      vUv = aPosition * 0.5 + 0.5; 
      vL = vUv - vec2(texelSize.x, 0.0); 
      vR = vUv + vec2(texelSize.x, 0.0); 
      vT = vUv + vec2(0.0, texelSize.y); 
      vB = vUv - vec2(0.0, texelSize.y); 
      gl_Position = vec4(aPosition, 0.0, 1.0); 
    }
  `);

  const splatPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv; 
    uniform sampler2D uTarget; 
    uniform float aspectRatio; 
    uniform vec3 color; 
    uniform vec2 point; 
    uniform float radius; 
    void main(){ 
      vec2 p = vUv - point.xy; 
      p.x *= aspectRatio; 
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p,p) / radius) * color, 1.0); 
    }
  `);

  const advectPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv; 
    uniform sampler2D uVelocity, uSource; 
    uniform vec2 texelSize, dyeTexelSize; 
    uniform float dt, dissipation; 
    vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){ 
      vec2 st = uv / tsize - 0.5, iuv = floor(st), fuv = fract(st); 
      return mix(mix(texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize), texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize), fuv.x), mix(texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize), texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize), fuv.x), fuv.y); 
    } 
    void main(){ 
      #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize; 
        vec4 result = bilerp(uSource, coord, dyeTexelSize); 
      #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize; 
        vec4 result = texture2D(uSource, coord); 
      #endif
      gl_FragColor = result / (1.0 + dissipation * dt); 
    }
  `, ext.supportLinearFiltering ? [] : ['MANUAL_FILTERING']);
  
  const divPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform sampler2D uVelocity; 
    void main(){ 
      float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x, T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y; 
      vec2 C = texture2D(uVelocity, vUv).xy; 
      if(vL.x < 0.0) L = -C.x; if(vR.x > 1.0) R = -C.x; if(vT.y > 1.0) T = -C.y; if(vB.y < 0.0) B = -C.y; 
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); 
    }
  `);
  
  const curlPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform sampler2D uVelocity; 
    void main(){ 
      gl_FragColor = vec4(0.5 * (texture2D(uVelocity, vR).y - texture2D(uVelocity, vL).y - texture2D(uVelocity, vT).x + texture2D(uVelocity, vB).x), 0.0, 0.0, 1.0); 
    }
  `);
  
  const pressPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform sampler2D uPressure, uDivergence; 
    void main(){ 
      gl_FragColor = vec4((texture2D(uPressure, vL).x + texture2D(uPressure, vR).x + texture2D(uPressure, vB).x + texture2D(uPressure, vT).x - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0); 
    }
  `);

  const gradPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform sampler2D uPressure, uVelocity; 
    void main(){ 
      gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(texture2D(uPressure, vR).x - texture2D(uPressure, vL).x, texture2D(uPressure, vT).x - texture2D(uPressure, vB).x), 0.0, 1.0); 
    }
  `);

  const shadPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv, vL, vR, vT, vB; 
    uniform sampler2D uTexture; 
    uniform vec2 texelSize; 
    void main(){ 
      vec3 c = texture2D(uTexture, vUv).rgb; 
      #ifdef SHADING
        float dx = length(texture2D(uTexture, vR).rgb) - length(texture2D(uTexture, vL).rgb), dy = length(texture2D(uTexture, vT).rgb) - length(texture2D(uTexture, vB).rgb); 
        c *= clamp(dot(normalize(vec3(dx, dy, length(texelSize))), vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0); 
      #endif
      gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); 
    }
  `, config.SHADING ? ['SHADING'] : []);

  const clearPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying vec2 vUv; 
    uniform sampler2D uTexture; 
    uniform float value; 
    void main(){ 
      gl_FragColor = value * texture2D(uTexture, vUv); 
    }
  `);
  
  const copyPS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; 
    varying highp vec2 vUv; 
    uniform sampler2D uTexture; 
    void main(){ 
      gl_FragColor = texture2D(uTexture, vUv); 
    }
  `);

  const progs = { 
    copy: createProgram(baseVS, copyPS), 
    clear: createProgram(baseVS, clearPS), 
    splat: createProgram(baseVS, splatPS), 
    advect: createProgram(baseVS, advectPS), 
    div: createProgram(baseVS, divPS), 
    curl: createProgram(baseVS, curlPS), 
    shad: createProgram(baseVS, shadPS), 
    press: createProgram(baseVS, pressPS), 
    grad: createProgram(baseVS, gradPS) 
  };

  function createFBO(w, h, intF, f, t, p) { 
    gl.activeTexture(gl.TEXTURE0); 
    let tex = gl.createTexture(); 
    gl.bindTexture(gl.TEXTURE_2D, tex); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, p); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, p); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
    gl.texImage2D(gl.TEXTURE_2D, 0, intF, w, h, 0, f, t, null); 
    let fbo = gl.createFramebuffer(); 
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); 
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); 
    
    // CRITICAL: Explicitly clear the FBO after creation to remove garbage memory
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return { 
      tex, fbo, w, h, tX: 1/w, tY: 1/h, 
      attach(i) { 
        gl.activeTexture(gl.TEXTURE0 + i); 
        gl.bindTexture(gl.TEXTURE_2D, tex); 
        return i; 
      } 
    }; 
  }

  function doubleFBO(w, h, intF, f, t, p) { 
    let f1 = createFBO(w, h, intF, f, t, p), f2 = createFBO(w, h, intF, f, t, p); 
    return { 
      w, h, tX: f1.tX, tY: f1.tY, 
      get read() { return f1; }, get write() { return f2; }, 
      swap() { let tmp = f1; f1 = f2; f2 = tmp; } 
    }; 
  }

  let dye, vel, div, curlTex, pres;
  function init() {
    let w = canvas.clientWidth, h = canvas.clientHeight, aspect = w/h; if(aspect < 1) aspect = 1/aspect;
    let r = config.SIM_RESOLUTION, dr = config.DYE_RESOLUTION, sW = w > h ? Math.round(r * aspect) : r, sH = w > h ? r : Math.round(r * aspect), dW = w > h ? Math.round(dr * aspect) : dr, dH = w > h ? dr : Math.round(dr * aspect);
    const T = ext.halfFloatTexType, RGBA = ext.formatRGBA, RG = ext.formatRG, R = ext.formatR, F = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
    dye = doubleFBO(dW, dH, RGBA.internalFormat, RGBA.format, T, F); 
    vel = doubleFBO(sW, sH, RG.internalFormat, RG.format, T, F); 
    div = createFBO(sW, sH, R.internalFormat, R.format, T, gl.NEAREST); 
    curlTex = createFBO(sW, sH, R.internalFormat, R.format, T, gl.NEAREST); 
    pres = doubleFBO(sW, sH, R.internalFormat, R.format, T, gl.NEAREST);
  }

  const blit = (t) => { 
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); 
    gl.viewport(0, 0, t ? t.w : gl.drawingBufferWidth, t ? t.h : gl.drawingBufferHeight); 
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); 
  };
  
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); 
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW); 
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); 
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW); 
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); 
  gl.enableVertexAttribArray(0);

  function splat(x, y, dx, dy, color) { 
    progs.splat.bind(); 
    gl.uniform1i(progs.splat.u.uTarget, vel.read.attach(0)); 
    gl.uniform1f(progs.splat.u.aspectRatio, canvas.width / canvas.height); 
    gl.uniform2f(progs.splat.u.point, x, y); 
    gl.uniform3f(progs.splat.u.color, dx, dy, 0); 
    gl.uniform1f(progs.splat.u.radius, config.SPLAT_RADIUS / 100 * (canvas.width > canvas.height ? canvas.width/canvas.height : 1)); 
    blit(vel.write); vel.swap(); 
    gl.uniform1i(progs.splat.u.uTarget, dye.read.attach(0)); 
    gl.uniform3f(progs.splat.u.color, color.r, color.g, color.b); 
    blit(dye.write); dye.swap(); 
  }
  
  let last = Date.now(), ptr = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, c: { r: 0.1, g: 0.1, b: 0.1 } };
  const hsv = (h) => { 
    let i = Math.floor(h * 6), f = h * 6 - i, q = 1 - f, t = f, r, g, b; 
    switch(i%6){case 0:r=1;g=t;b=0;break;case 1:r=q;g=1;b=0;break;case 2:r=0;g=1;b=t;break;case 3:r=0;g=q;b=1;break;case 4:r=t;g=0;b=1;break;case 5:r=1;g=0;b=q;break;} 
    return { r: r * 0.15, g: g * 0.15, b: b * 0.15 }; 
  };

  const loop = () => { 
    let n = Date.now(), dt = Math.min((n - last) / 1000, 0.016); last = n; 
    let w = Math.floor(canvas.clientWidth * (window.devicePixelRatio||1)), h = Math.floor(canvas.clientHeight * (window.devicePixelRatio||1)); 
    if(canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; init(); } 

    gl.disable(gl.BLEND);
    progs.curl.bind(); gl.uniform2f(progs.curl.u.texelSize, vel.tX, vel.tY); gl.uniform1i(progs.curl.u.uVelocity, vel.read.attach(0)); blit(curlTex);
    progs.div.bind(); gl.uniform2f(progs.div.u.texelSize, vel.tX, vel.tY); gl.uniform1i(progs.div.u.uVelocity, vel.read.attach(0)); blit(div);
    progs.clear.bind(); gl.uniform1i(progs.clear.u.uTexture, pres.read.attach(0)); gl.uniform1f(progs.clear.u.value, config.PRESSURE); blit(pres.write); pres.swap();
    progs.press.bind(); gl.uniform2f(progs.press.u.texelSize, vel.tX, vel.tY); gl.uniform1i(progs.press.u.uDivergence, div.attach(0)); for(let i = 0; i < config.PRESSURE_ITERATIONS; i++){ gl.uniform1i(progs.press.u.uPressure, pres.read.attach(1)); blit(pres.write); pres.swap(); }
    progs.grad.bind(); gl.uniform2f(progs.grad.u.texelSize, vel.tX, vel.tY); gl.uniform1i(progs.grad.u.uPressure, pres.read.attach(0)); gl.uniform1i(progs.grad.u.uVelocity, vel.read.attach(1)); blit(vel.write); vel.swap();
    progs.advect.bind(); gl.uniform2f(progs.advect.u.texelSize, vel.tX, vel.tY); if(!ext.supportLinearFiltering) gl.uniform2f(progs.advect.u.dyeTexelSize, vel.tX, vel.tY); let v = vel.read.attach(0); gl.uniform1i(progs.advect.u.uVelocity, v); gl.uniform1i(progs.advect.u.uSource, v); gl.uniform1f(progs.advect.u.dt, dt); gl.uniform1f(progs.advect.u.dissipation, config.VELOCITY_DISSIPATION); blit(vel.write); vel.swap();
    if(!ext.supportLinearFiltering) gl.uniform2f(progs.advect.u.dyeTexelSize, dye.tX, dye.tY); gl.uniform1i(progs.advect.u.uVelocity, vel.read.attach(0)); gl.uniform1i(progs.advect.u.uSource, dye.read.attach(1)); gl.uniform1f(progs.advect.u.dissipation, config.DENSITY_DISSIPATION); blit(dye.write); dye.swap();
    
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND);
    progs.shad.bind(); if(config.SHADING) gl.uniform2f(progs.shad.u.texelSize, 1/canvas.width, 1/canvas.height); gl.uniform1i(progs.shad.u.uTexture, dye.read.attach(0)); blit(null);
    requestAnimationFrame(loop); 
  };
  
  canvas.addEventListener('mousedown', () => { ptr.c = hsv(Math.random()); let c = { r: ptr.c.r * 10, g: ptr.c.g * 10, b: ptr.c.b * 10 }; splat(ptr.x, ptr.y, (Math.random()-0.5)*10, (Math.random()-0.5)*30, c); });
  window.addEventListener('mousemove', e => { ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = e.clientX / canvas.clientWidth; ptr.y = 1 - e.clientY / canvas.clientHeight; let dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, a = canvas.width / canvas.height; if(a < 1) dx *= a; else dy /= a; if(Math.abs(dx) > 0 || Math.abs(dy) > 0) splat(ptr.x, ptr.y, dx * config.SPLAT_FORCE, dy * config.SPLAT_FORCE, ptr.c); });
  window.addEventListener('touchmove', e => { let t = e.targetTouches[0]; ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = t.clientX / canvas.clientWidth; ptr.y = 1 - t.clientY / canvas.clientHeight; let dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, a = canvas.width / canvas.height; if(a < 1) dx *= a; else dy /= a; if(Math.abs(dx) > 0 || Math.abs(dy) > 0) splat(ptr.x, ptr.y, dx * config.SPLAT_FORCE, dy * config.SPLAT_FORCE, ptr.c); });
  setInterval(() => ptr.c = hsv(Math.random()), 100);
  init(); loop();
}
