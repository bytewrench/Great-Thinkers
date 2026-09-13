import { useEffect, useRef, useState } from "react";

const hues = { conflict: 8, "common-ground": 42, agreement: 155, unclear: 190 };
const formatBytes = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

function SignalCore({ telemetry, hue, active }) {
  const canvas = useRef(null);
  const color = useRef(hue);
  useEffect(() => {
    color.current = hue;
  }, [hue]);
  useEffect(() => {
    const element = canvas.current,
      ctx = element.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let frame,
      lastDraw = 0,
      previousChunks = 0,
      energy = 0;
    const waves = [];
    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      if (
        document.hidden ||
        now - lastDraw < (reduce.matches || !active ? 200 : 32)
      )
        return;
      const dt = Math.min(100, now - lastDraw);
      lastDraw = now;
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (
        element.width !== Math.round(width * ratio) ||
        element.height !== Math.round(height * ratio)
      ) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const data = telemetry.current;
      if (data.chunks !== previousChunks) {
        energy = Math.min(1, energy + 0.35);
        waves.push({
          born: now,
          strength: Math.min(1, (data.chunks - previousChunks) / 3 + 0.3),
        });
        if (waves.length > 16) waves.shift();
        previousChunks = data.chunks;
      }
      energy *= Math.exp(-dt / 500);
      const h = color.current,
        x = width / 2,
        y = height * 0.45,
        time = reduce.matches || !active ? 0 : now / 1000;
      const light = (alpha, luminosity = 65) =>
        `hsla(${h},95%,${luminosity}%,${alpha})`;
      // Perspective floor and optical haze are decorative; pulses below are driven by received chunks.
      const haze = ctx.createRadialGradient(x, y, 8, x, y, 135);
      haze.addColorStop(0, light(0.16 + energy * 0.13));
      haze.addColorStop(1, light(0));
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = light(0.12);
      ctx.lineWidth = 0.6;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 11, y + 28);
        ctx.lineTo(x + i * 67, height);
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const fy = y + 55 + i * i * 5;
        ctx.beginPath();
        ctx.moveTo(20, fy);
        ctx.lineTo(width - 20, fy);
        ctx.stroke();
      }
      const project = (angle, radius, tilt, twist) => {
        const a = Math.cos(angle) * radius,
          b = Math.sin(angle) * radius;
        const z = b * Math.sin(tilt),
          py = b * Math.cos(tilt),
          scale = 330 / (330 - z);
        return {
          x: x + (a * Math.cos(twist) - py * Math.sin(twist)) * scale,
          y: y + (a * Math.sin(twist) + py * Math.cos(twist)) * scale,
          z,
        };
      };
      for (let ring = 0; ring < 3; ring++) {
        const tilt = 0.85 + ring * 0.3,
          twist = ring * 1.07 + time * 0.09;
        for (let j = 0; j < 110; j++) {
          const a = (j / 110) * Math.PI * 2,
            p = project(a, 67 + ring * 8, tilt, twist),
            q = project(a + 0.057, 67 + ring * 8, tilt, twist);
          ctx.strokeStyle = light(p.z > 0 ? 0.58 : 0.15);
          ctx.lineWidth = p.z > 0 ? 1.1 : 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        if (energy > 0.015 && !reduce.matches) {
          for (let j = 0; j < 14; j++) {
            const p = project(
              time * (1 + ring * 0.2) - j * 0.035 + ring * 2,
              67 + ring * 8,
              tilt,
              twist,
            );
            ctx.fillStyle = light((1 - j / 14) * energy, 85);
            ctx.shadowColor = light(0.9);
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, j === 0 ? 2.8 : 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.shadowBlur = 0;
      for (let i = waves.length - 1; i >= 0; i--) {
        const age = (now - waves[i].born) / 1300;
        if (age > 1) {
          waves.splice(i, 1);
          continue;
        }
        if (reduce.matches) continue;
        ctx.strokeStyle = light((1 - age) * 0.45 * waves[i].strength);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, 34 + age * 106, 18 + age * 52, -0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      const core = ctx.createRadialGradient(x - 13, y - 15, 1, x, y, 34);
      core.addColorStop(0, "#efffff");
      core.addColorStop(0.17, light(1, 82));
      core.addColorStop(0.48, light(1, 37));
      core.addColorStop(0.83, "#071c2d");
      core.addColorStop(1, light(0.8, 66));
      ctx.shadowColor = light(0.8);
      ctx.shadowBlur = 19 + energy * 35;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, 33 + energy * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 30, 3.4, 5.5);
      ctx.stroke();
      // Trace bins contain measured response bytes over the last 8 seconds; silence is flat.
      const bins = Array(40).fill(0);
      for (const sample of data.samples) {
        const index = Math.floor((sample.at - now + 8000) / 200);
        if (index >= 0 && index < 40) bins[index] += sample.bytes;
      }
      const peak = Math.max(1024, ...bins),
        base = height - 15;
      ctx.beginPath();
      ctx.moveTo(20, base);
      bins.forEach((n, i) =>
        ctx.lineTo(
          20 + (i * (width - 40)) / 39,
          base - Math.sqrt(n / peak) * 28,
        ),
      );
      ctx.strokeStyle = light(0.9);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.lineTo(width - 20, height);
      ctx.lineTo(20, height);
      ctx.closePath();
      ctx.fillStyle = light(0.05);
      ctx.fill();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [telemetry, active]);
  return <canvas ref={canvas} className="signal-canvas" aria-hidden="true" />;
}

export default function ActivityGraphic({ telemetry, active, state }) {
  const idle = useRef({ bytes: 0, chunks: 0, samples: [], lastAt: 0 });
  const [metrics, setMetrics] = useState({ bytes: 0, rate: 0, elapsed: 0 });
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const now = performance.now(),
        d = telemetry.current;
      setMetrics({
        bytes: d.bytes,
        rate: d.samples
          .filter((s) => now - s.at < 1000)
          .reduce((n, s) => n + s.bytes, 0),
        elapsed: (now - d.startedAt) / 1000,
      });
    }, 200);
    return () => clearInterval(timer);
  }, [telemetry, active]);
  const hue = hues[state] ?? hues.unclear;
  return (
    <div
      className="activity-inline"
      style={{ "--signal-hue": hue }}
      aria-label="Conversation signal"
    >
      <SignalCore
        telemetry={active ? telemetry : idle}
        hue={hue}
        active={active}
      />
      <div className="activity-inline-caption">
        <span>
          {active
            ? metrics.rate
              ? "RECEIVING"
              : "AWAITING RESPONSE"
            : "READY"}
        </span>
        {active && <span>{formatBytes(metrics.rate)}/s</span>}
      </div>
      {active && (
        <div
          className="activity-inline-stats"
          title="Measured response stream data; motion is stylized"
        >
          {formatBytes(metrics.bytes)} received · {metrics.elapsed.toFixed(0)}s
        </div>
      )}
    </div>
  );
}
