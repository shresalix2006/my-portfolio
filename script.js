/* ============================================
   PORTFOLIO — JAVASCRIPT
   ============================================ */

// ---- Custom Cursor ----
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursorFollower');
let mx = 0, my = 0, fx = 0, fy = 0;

document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = mx + 'px';
  cursor.style.top = my + 'px';
});

(function animateCursor() {
  fx += (mx - fx) * 0.12;
  fy += (my - fy) * 0.12;
  follower.style.left = fx + 'px';
  follower.style.top = fy + 'px';
  requestAnimationFrame(animateCursor);
})();

document.querySelectorAll('a, button, .project-card, .skill-item, .contact-item').forEach(el => {
  el.addEventListener('mouseenter', () => {
    follower.style.width = '50px';
    follower.style.height = '50px';
    follower.style.borderColor = 'rgba(167,139,250,0.8)';
    cursor.style.background = '#a78bfa';
  });
  el.addEventListener('mouseleave', () => {
    follower.style.width = '32px';
    follower.style.height = '32px';
    follower.style.borderColor = 'rgba(167,139,250,0.5)';
    cursor.style.background = 'var(--purple-light)';
  });
});

// ---- Antigravity Particle Canvas ----
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let W, H;

// Antigravity config (matches React component props)
const AG = {
  count: 300,
  magnetRadius: 6,
  ringRadius: 7,
  waveSpeed: 0.2,
  waveAmplitude: 0.3,
  particleSize: 1.5,
  lerpSpeed: 0.05,
  color: [236, 72, 153], // #EC4899 in RGB
  particleVariance: 1,
  rotationSpeed: 0,
  depthFactor: 1,
  pulseSpeed: 3,
  fieldStrength: 10,
};

// Mouse tracking for magnetic effect
let mouseCanvas = { x: -9999, y: -9999 };
document.addEventListener('mousemove', e => {
  mouseCanvas.x = e.clientX;
  mouseCanvas.y = e.clientY;
});
document.addEventListener('mouseleave', () => {
  mouseCanvas.x = -9999;
  mouseCanvas.y = -9999;
});

function resizeCanvas() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Create particles arranged on a 3D ring
const agParticles = [];
for (let i = 0; i < AG.count; i++) {
  const angle = (i / AG.count) * Math.PI * 2;
  const variance = (Math.random() - 0.5) * AG.particleVariance;
  const depthAngle = Math.random() * Math.PI * 2;
  const ringR = AG.ringRadius * 30; // scale to pixels

  agParticles.push({
    // Base position on ring (3D)
    baseAngle: angle,
    depthAngle: depthAngle,
    radiusOffset: variance * 20,
    // Current rendered position
    x: 0, y: 0,
    // Target position (lerp towards)
    tx: 0, ty: 0,
    // Size variance
    size: AG.particleSize + (Math.random() - 0.5) * 0.8,
    // Capsule rotation
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.02,
    // Opacity
    alpha: 0.3 + Math.random() * 0.5,
    // Phase offset for wave
    phase: Math.random() * Math.PI * 2,
    // Depth z for perspective
    z: 0,
  });
}

let agTime = 0;

function drawAntigravity() {
  ctx.clearRect(0, 0, W, H);
  agTime += 0.016; // ~60fps timestep

  const centerX = W / 2;
  const centerY = H / 2;
  const baseRadius = Math.min(W, H) * 0.28;
  const pulse = Math.sin(agTime * AG.pulseSpeed) * 0.1 + 1;

  // Sort by depth for painter's algorithm
  agParticles.forEach((p, i) => {
    // Animate angle over time
    const animAngle = p.baseAngle + agTime * AG.waveSpeed * 0.3;
    
    // Wave distortion
    const wave = Math.sin(animAngle * 3 + agTime * AG.waveSpeed * 2 + p.phase) * AG.waveAmplitude * 40;
    
    // 3D ring coordinates
    const r = (baseRadius + p.radiusOffset + wave) * pulse;
    const z3d = Math.sin(p.depthAngle + agTime * 0.3) * AG.depthFactor * 80;
    
    // Perspective projection
    const perspective = 600;
    const scale = perspective / (perspective + z3d);
    
    p.tx = centerX + Math.cos(animAngle) * r * scale;
    p.ty = centerY + Math.sin(animAngle) * r * scale;
    p.z = z3d;
    
    // Magnetic mouse interaction
    const dmx = mouseCanvas.x - p.tx;
    const dmy = mouseCanvas.y - p.ty;
    const dist = Math.sqrt(dmx * dmx + dmy * dmy);
    const magnetDist = AG.magnetRadius * 30;
    
    if (dist < magnetDist && dist > 0) {
      const force = (1 - dist / magnetDist) * AG.fieldStrength;
      p.tx += (dmx / dist) * force;
      p.ty += (dmy / dist) * force;
    }
    
    // Lerp to target
    p.x += (p.tx - p.x) * AG.lerpSpeed;
    p.y += (p.ty - p.y) * AG.lerpSpeed;
    
    // Rotate capsule
    p.rotation += p.rotSpeed;
    
    // Store scale for rendering
    p.scale = scale;
  });

  // Sort by z-depth (back to front)
  const sorted = [...agParticles].sort((a, b) => a.z - b.z);

  sorted.forEach(p => {
    const s = p.size * p.scale * pulse;
    const depthAlpha = 0.2 + (p.scale - 0.7) * 2;
    const alpha = Math.max(0.08, Math.min(0.9, p.alpha * depthAlpha));
    
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    
    // Capsule shape: a rounded rectangle
    const capsuleW = s * 3.2;
    const capsuleH = s * 1.2;
    const r = capsuleH / 2;
    
    // Glow effect
    ctx.shadowBlur = 8 * p.scale;
    ctx.shadowColor = `rgba(${AG.color[0]}, ${AG.color[1]}, ${AG.color[2]}, ${alpha * 0.6})`;
    
    ctx.beginPath();
    ctx.moveTo(-capsuleW / 2 + r, -capsuleH / 2);
    ctx.lineTo(capsuleW / 2 - r, -capsuleH / 2);
    ctx.arc(capsuleW / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-capsuleW / 2 + r, capsuleH / 2);
    ctx.arc(-capsuleW / 2 + r, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    
    ctx.fillStyle = `rgba(${AG.color[0]}, ${AG.color[1]}, ${AG.color[2]}, ${alpha})`;
    ctx.fill();
    
    ctx.restore();
  });

  // Draw faint connection lines between nearby particles
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = dx * dx + dy * dy;
      if (d < 3600) { // within 60px
        const lineAlpha = (1 - d / 3600) * 0.08;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${AG.color[0]}, ${AG.color[1]}, ${AG.color[2]}, ${lineAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(drawAntigravity);
}
drawAntigravity();

// ---- Splash Cursor (Fluid) ----
const fluidCanvas = document.getElementById('fluid');
if (fluidCanvas) {
  initSplashCursor(fluidCanvas, {
    RAINBOW_MODE: true,
    DENSITY_DISSIPATION: 3.5,
    VELOCITY_DISSIPATION: 2,
    CURL: 3,
    SPLAT_RADIUS: 0.2
  });
}

// ---- Navbar Scroll ----
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
  updateActiveNav();
});

// ---- Active Nav Link ----
const sections = ['hero', 'about', 'education', 'skills', 'experience', 'projects', 'certifications', 'contact'];
function updateActiveNav() {
  const scrollY = window.scrollY;
  sections.forEach(id => {
    const el = document.getElementById(id);
    const navEl = document.getElementById('nav-' + id);
    if (!el || !navEl) return;
    const top = el.offsetTop - 100;
    const bottom = top + el.offsetHeight;
    navEl.classList.toggle('active', scrollY >= top && scrollY < bottom);
  });
}

// ---- Hamburger Menu ----
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  const spans = hamburger.querySelectorAll('span');
  if (navLinks.classList.contains('open')) {
    spans[0].style.transform = 'rotate(45deg) translateY(7px)';
    spans[1].style.opacity = '0';
    spans[2].style.transform = 'rotate(-45deg) translateY(-7px)';
  } else {
    spans[0].style.transform = '';
    spans[1].style.opacity = '';
    spans[2].style.transform = '';
  }
});
navLinks.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.querySelectorAll('span').forEach(s => {
      s.style.transform = ''; s.style.opacity = '';
    });
  });
});

// ---- Typewriter ----
const typewriterEl = document.getElementById('typewriter');
const phrases = [
  'AI / ML Developer 🤖',
  'Data Science @ IIT Madras 📊',
  'President, Geek Room 👑',
  'BTech CSE (AIML) 💻',
  'Cybersecurity Enthusiast 🔐',
  'F1 Analytics Nerd 🏎️',
];
let phraseIdx = 0, charIdx = 0, isDeleting = false;

function typeLoop() {
  const current = phrases[phraseIdx];
  const displayed = isDeleting
    ? current.substring(0, charIdx - 1)
    : current.substring(0, charIdx + 1);
  charIdx = isDeleting ? charIdx - 1 : charIdx + 1;
  typewriterEl.innerHTML = displayed + '<span class="cursor-blink"></span>';

  let delay = isDeleting ? 60 : 90;
  if (!isDeleting && charIdx > current.length) {
    delay = 1800;
    isDeleting = true;
  } else if (isDeleting && charIdx === 0) {
    isDeleting = false;
    phraseIdx = (phraseIdx + 1) % phrases.length;
    delay = 400;
  }
  setTimeout(typeLoop, delay);
}
typeLoop();

// ---- Scroll Reveal ----
const revealEls = document.querySelectorAll('.reveal');
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
    }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => revealObs.observe(el));

// ---- Skill Bars ----
const skillsGrid = document.querySelector('.skills-grid');
const skillsObs = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      skillsGrid.classList.add('animated');
      skillsObs.disconnect();
    }
  });
}, { threshold: 0.2 });
if (skillsGrid) skillsObs.observe(skillsGrid);

// ---- Counter Animation ----
const statNumbers = document.querySelectorAll('.stat-number');
const counterObs = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      let current = 0;
      const step = target / 60;
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = Math.floor(current);
      }, 20);
      counterObs.unobserve(el);
    }
  });
}, { threshold: 0.5 });
statNumbers.forEach(n => counterObs.observe(n));

// ---- Contact Form ----
const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    const btn = contactForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Sending...';
    setTimeout(() => {
      formSuccess.classList.add('show');
      contactForm.reset();
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Send Message';
    }, 1200);
  });
}

// ---- Smooth scroll for anchor links ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const href = anchor.getAttribute('href');
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---- Parallax tilt on hero visual ----
const heroVisual = document.querySelector('.hero-visual');
if (heroVisual) {
  document.addEventListener('mousemove', e => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;
    heroVisual.style.transform = `perspective(1000px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg)`;
  });
  document.addEventListener('mouseleave', () => {
    heroVisual.style.transform = '';
  });
}

// ---- Ripple effect on buttons ----
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', function(e) {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position:absolute; border-radius:50%; pointer-events:none;
      width:0;height:0; left:${x}px; top:${y}px;
      background:rgba(255,255,255,0.2);
      transform:translate(-50%,-50%);
      animation: ripple-anim 0.6s ease-out forwards;
    `;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});

// Inject ripple keyframes
const style = document.createElement('style');
style.innerHTML = `@keyframes ripple-anim{to{width:200px;height:200px;opacity:0}}`;
document.head.appendChild(style);

console.log('%c👋 Hey there! Curious about the code? Feel free to reach out!', 'color: #a78bfa; font-size: 14px; font-weight: bold;');
