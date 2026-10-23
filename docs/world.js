/* ─────────────────────────────────────────────
   VECTOR WORLD ENGINE
   GSAP + ScrollTrigger driven adventure world
   ───────────────────────────────────────────── */

gsap.registerPlugin(ScrollTrigger);

// ─── State ───────────────────────────────────
let worldProgress = 0;
let forkShown = false;
let finalShown = false;
const WORLD_WIDTH = 8000;
const VIEWPORT = window.innerWidth;

// ─── Custom Cursor ────────────────────────────
const cursor = document.getElementById('cursor');
const cursorRing = document.getElementById('cursor-ring');
let mouseX = 0, mouseY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  gsap.to(cursor, { x: mouseX, y: mouseY, duration: 0.08 });
  gsap.to(cursorRing, { x: mouseX, y: mouseY, duration: 0.18 });
});

document.querySelectorAll('.story-obj, .fork-btn, button, #modal-close').forEach(el => {
  el.addEventListener('mouseenter', () => {
    gsap.to(cursor, { scale: 1.8, background: 'rgba(251,191,36,0.8)' });
    gsap.to(cursorRing, { scale: 1.6, borderColor: 'rgba(251,191,36,0.5)' });
  });
  el.addEventListener('mouseleave', () => {
    gsap.to(cursor, { scale: 1, background: 'rgba(103,232,249,0.7)' });
    gsap.to(cursorRing, { scale: 1, borderColor: 'rgba(103,232,249,0.4)' });
  });
});

// ─── Scroll → Camera ─────────────────────────
const world = document.getElementById('world');
const progressBar = document.getElementById('progress-bar');
const scrollHint = document.getElementById('scroll-hint');

let currentX = 0;
let targetX = 0;
let isWheelActive = false;

window.addEventListener('wheel', e => {
  e.preventDefault();
  targetX = Math.max(0, Math.min(WORLD_WIDTH - VIEWPORT, targetX + e.deltaY * 2.2));
}, { passive: false });

// Touch support
let touchStartX = 0;
window.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
window.addEventListener('touchmove', e => {
  e.preventDefault();
  const dx = touchStartX - e.touches[0].clientX;
  targetX = Math.max(0, Math.min(WORLD_WIDTH - VIEWPORT, targetX + dx * 2));
  touchStartX = e.touches[0].clientX;
}, { passive: false });

// RAF loop for smooth camera
function cameraTick() {
  currentX += (targetX - currentX) * 0.072;
  world.style.transform = `translateX(${-currentX}px)`;

  const progress = currentX / (WORLD_WIDTH - VIEWPORT);
  worldProgress = progress;
  progressBar.style.width = (progress * 100) + '%';

  // Hide scroll hint after first scroll
  if (currentX > 100 && scrollHint.style.opacity !== '0') {
    gsap.to(scrollHint, { opacity: 0, duration: 0.6 });
  }

  // Parallax layers
  parallaxTick(currentX);

  // Fork check
  if (progress > 0.68 && progress < 0.85 && !forkShown) {
    showFork();
  } else if ((progress <= 0.65 || progress >= 0.88) && forkShown) {
    hideFork();
  }

  // Final scene
  if (progress > 0.94 && !finalShown) {
    finalShown = true;
    showFinalScene();
  }

  requestAnimationFrame(cameraTick);
}
requestAnimationFrame(cameraTick);

// ─── Parallax ─────────────────────────────────
function parallaxTick(camX) {
  const layers = [
    { id: 'bg-mountains', speed: 0.15 },
    { id: 'bg-sky-stars', speed: 0.08 },
    { id: 'mid-treeline', speed: 0.35 },
    { id: 'mid-river', speed: 0.6 },
    { id: 'fg-plants', speed: 0.8 },
  ];
  layers.forEach(({ id, speed }) => {
    const el = document.getElementById(id);
    if (el) el.style.transform = `translateX(${-(camX * speed)}px)`;
  });
}

// ─── Modal System ─────────────────────────────
const modal = document.getElementById('modal-overlay');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.classList.add('visible');
  gsap.fromTo('#modal-box', { scale: 0.88, y: 20, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' });
}
modalClose.addEventListener('click', () => {
  gsap.to('#modal-box', { scale: 0.9, opacity: 0, duration: 0.25, onComplete: () => modal.classList.remove('visible') });
});
modal.addEventListener('click', e => {
  if (e.target === modal) modalClose.click();
});

// Story data
const storyData = {
  sign1: {
    title: '🌿 The Beginning',
    body: `<p>Hello! I'm Bineta — a passionate developer who loves crafting digital experiences that feel alive.</p>
           <p>This journey began with a spark of curiosity and grew into a full adventure through code, design, and storytelling.</p>
           <p><strong>Skills:</strong> React • TypeScript • Node.js • Python • UI/UX Design</p>`
  },
  campfire1: {
    title: '🔥 About Me',
    body: `<p>I'm a full-stack developer with a love for beautiful interfaces and clean architecture.</p>
           <p>When I'm not coding, you'll find me sketching UI concepts, exploring vector art, or getting lost in adventure games.</p>
           <p><strong>Education:</strong> Computer Science • Design Systems • Open Source Contributor</p>`
  },
  ruins1: {
    title: '🏛️ My Journey',
    body: `<p>From building my first "Hello World" to shipping production apps — every step has been an adventure.</p>
           <p>I believe the best code tells a story and the best apps feel like magic.</p>
           <p><strong>Currently:</strong> Building beautiful mobile experiences & exploring creative coding.</p>`
  },
  lantern1: {
    title: '✨ Philosophy',
    body: `<p>Design is not just how it looks — it's how it feels, how it moves, and how it makes someone's day better.</p>
           <p>I strive to create work that is not only functional but genuinely delightful.</p>
           <p><em>"Make it work, make it right, make it beautiful."</em></p>`
  },
  sign2: {
    title: '📜 Projects',
    body: `<p>Choose your path ahead to explore my work:</p>
           <p>⬅️ <strong>Technical Expedition</strong> — Dive into my engineering projects, code architecture, and technical challenges solved.</p>
           <p>➡️ <strong>Leadership Trail</strong> — Discover how I lead teams, drive product vision, and build collaborative cultures.</p>`
  }
};

// Bind clickable objects
document.querySelectorAll('[data-story]').forEach(el => {
  el.addEventListener('click', () => {
    const key = el.dataset.story;
    if (storyData[key]) openModal(storyData[key].title, storyData[key].body);
  });
});

// ─── River Fork ───────────────────────────────
const forkOverlay = document.getElementById('fork-overlay');
function showFork() {
  forkShown = true;
  forkOverlay.classList.add('visible');
}
function hideFork() {
  forkShown = false;
  forkOverlay.classList.remove('visible');
}

// Fork navigation
document.getElementById('fork-tech').addEventListener('click', () => navigateTo('technical.html'));
document.getElementById('fork-lead').addEventListener('click', () => navigateTo('leadership.html'));

function navigateTo(url) {
  const trans = document.getElementById('scene-transition');
  trans.classList.add('visible');
  setTimeout(() => { window.location.href = url; }, 800);
}

// ─── Final Scene ──────────────────────────────
function showFinalScene() {
  const final = document.getElementById('final-scene');
  final.classList.add('visible');
  setTimeout(() => {
    document.getElementById('final-text').classList.add('visible');
  }, 600);
}

// ─── Fireflies ────────────────────────────────
function spawnFireflies() {
  const container = document.getElementById('world');
  for (let i = 0; i < 40; i++) {
    const ff = document.createElement('div');
    ff.className = 'firefly';
    const size = Math.random() * 5 + 3;
    const dx = (Math.random() - 0.5) * 80;
    const dy = (Math.random() - 0.5) * 80;
    ff.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * WORLD_WIDTH}px;
      top:${30 + Math.random() * 55}%;
      --dx:${dx}px; --dy:${dy}px;
      animation-delay:${Math.random() * 4}s;
      animation-duration:${4 + Math.random() * 5}s, ${1.5 + Math.random() * 2}s;
    `;
    container.appendChild(ff);
  }
}

// ─── Leaf Particles ───────────────────────────
function spawnLeaves() {
  setInterval(() => {
    const leaf = document.createElement('div');
    leaf.className = 'leaf-particle';
    const hue = 100 + Math.floor(Math.random() * 40);
    leaf.style.cssText = `
      left:${currentX + Math.random() * VIEWPORT}px;
      top:-20px;
      background: hsl(${hue}, 60%, 25%);
      animation-duration:${6 + Math.random() * 6}s;
      animation-delay:0s;
      width:${8 + Math.random() * 8}px;
      height:${5 + Math.random() * 5}px;
    `;
    document.getElementById('world').appendChild(leaf);
    setTimeout(() => leaf.remove(), 12000);
  }, 1200);
}

// ─── Init ─────────────────────────────────────
spawnFireflies();
spawnLeaves();

// Intro animation
gsap.from('#hud', { opacity: 0, y: -20, duration: 1.2, delay: 0.5 });
gsap.from('#scroll-hint', { opacity: 0, y: 20, duration: 1.2, delay: 1 });
