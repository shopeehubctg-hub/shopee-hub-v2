"use client";

import { useEffect, useRef, useState } from "react";

export const salesMonitorUrl = "/api/live-sales-monitor";
type Crop = { x: number; y: number; width: number; height: number };
type Peer = { id: string; token: string; offer: string; answered: boolean };
type Signal = { room?: string; token?: string; answer?: string; peers?: Peer[] };

async function signal(body: object): Promise<Signal> {
  const response = await fetch(salesMonitorUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error(String(response.status));
  return response.json();
}

async function gather(peer: RTCPeerConnection, sdp: RTCSessionDescriptionInit) {
  await peer.setLocalDescription(sdp);
  if (peer.iceGatheringState !== "complete") {
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (peer.iceGatheringState === "complete") {
          clearTimeout(timer);
          peer.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      const timer = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", check);
        reject(Error("ICE gathering timed out"));
      }, 5000);
      peer.addEventListener("icegatheringstatechange", check);
      check();
    });
  }
  return peer.localDescription?.sdp ?? "";
}

export function LiveSalesMonitor({ canCast }: { canCast: boolean }) {
  const source = useRef<HTMLVideoElement>(null);
  const output = useRef<HTMLVideoElement>(null);
  const clean = useRef<() => void>(() => {});
  const mounted = useRef(false);
  const capture = useRef<MediaStream | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [preview, setPreview] = useState(false);
  const [emails, setEmails] = useState("");
  const [status, setStatus] = useState("Offline");
  const [busy, setBusy] = useState(false);

  function stop() {
    clean.current();
    clean.current = () => {};
    capture.current?.getTracks().forEach(track => track.stop());
    capture.current = null;
    if (source.current) source.current.srcObject = null;
    if (output.current) output.current.srcObject = null;
    setPreview(false);
    setCrop(null);
    setStatus("Offline");
    setBusy(false);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clean.current();
      capture.current?.getTracks().forEach(track => track.stop());
      capture.current = null;
    };
  }, []);

  async function chooseTab() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      capture.current?.getTracks().forEach(track => track.stop());
      const track = stream.getVideoTracks()[0];
      if (track.getSettings().displaySurface !== "browser") {
        track.stop();
        setStatus("Choose a browser tab to continue.");
        return;
      }
      capture.current = stream;
      track.addEventListener("ended", stop, { once: true });
      if (source.current) source.current.srcObject = stream;
      setPreview(true);
      setStatus("Select the area to share");
    } catch { setStatus("No tab selected"); }
  }

  async function start() {
    const video = source.current;
    if (!video || !crop || !video.videoWidth || !capture.current) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) { stop(); return; }
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    canvas.width = Math.round(originalWidth * crop.width);
    canvas.height = Math.round(originalHeight * crop.height);
    if (canvas.width < 80 || canvas.height < 60) { setBusy(false); setStatus("Select a larger area."); return; }
    const draw = () => {
      if (video.videoWidth !== originalWidth || video.videoHeight !== originalHeight) { stop(); return; }
      context.drawImage(video, crop.x * originalWidth, crop.y * originalHeight, canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height);
    };
    draw();
    const media = canvas.captureStream(10);
    try {
      const { room } = await signal({ action: "start", emails: emails.split(/[\s,]+/).filter(Boolean).map(email => email.toLowerCase()) });
      if (!room) throw Error("No room");
      if (!capture.current) { void signal({ action: "stop", room }).catch(() => {}); return; }
      if (output.current) output.current.srcObject = media;
      const connections = new Map<string, RTCPeerConnection>();
      let running = true;
      const frames = window.setInterval(draw, 100);
      let timer: number;
      let expiry: number;
      clean.current = () => {
        running = false;
        clearTimeout(timer);
        clearTimeout(expiry);
        clearInterval(frames);
        connections.forEach(peer => peer.close());
        media.getTracks().forEach(track => track.stop());
        void signal({ action: "stop", room }).catch(() => {});
      };
      const tick = async () => {
        try {
          const { peers = [] } = await signal({ action: "host", room });
          if (!running) return;
          clearTimeout(expiry);
          expiry = window.setTimeout(stop, 18000);
          for (const [token, connection] of connections) {
            if (!peers.some(peer => peer.token === token)) { connection.close(); connections.delete(token); }
          }
          for (const peer of peers) {
            if (!running) return;
            if (connections.has(peer.token)) continue;
            const connection = new RTCPeerConnection();
            connections.set(peer.token, connection);
            media.getTracks().forEach(track => connection.addTrack(track, media));
            try {
              await connection.setRemoteDescription({ type: "offer", sdp: peer.offer });
              const answer = await gather(connection, await connection.createAnswer());
              if (running) await signal({ action: "host", room, viewer: peer.id, token: peer.token, answer });
            } catch {
              connection.close();
              connections.delete(peer.token);
            }
          }
          if (running) timer = window.setTimeout(tick, 1500);
        } catch { if (running) stop(); }
      };
      setStatus("Live");
      expiry = window.setTimeout(stop, 18000);
      void tick();
    } catch {
      media.getTracks().forEach(track => track.stop());
      setBusy(false);
      setStatus("Could not start. Check the Staging viewer emails and whether another session is live.");
    }
  }

  async function watch() {
    setBusy(true);
    setStatus("Connecting…");
    const peer = new RTCPeerConnection();
    let active = true;
    let timer: number;
    let expiry: number;
    clean.current = () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(expiry);
      peer.close();
    };
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = event => {
      if (output.current && active) output.current.srcObject = event.streams[0];
    };
    peer.onconnectionstatechange = () => {
      if (!active) return;
      if (peer.connectionState === "connected") setStatus("Live");
      if (peer.connectionState === "failed") { stop(); setStatus("Could not connect to the casting computer."); }
    };
    try {
      const offer = await gather(peer, await peer.createOffer());
      const { room, token } = await signal({ action: "join", offer });
      const tick = async () => {
        if (!active) return;
        try {
          const { answer } = await signal({ action: "watch", room, token });
          if (!active) return;
          if (answer && !peer.currentRemoteDescription) await peer.setRemoteDescription({ type: "answer", sdp: answer });
          if (active) timer = window.setTimeout(tick, 2000);
        } catch { if (active) stop(); }
      };
      expiry = window.setTimeout(() => {
        if (active && peer.connectionState !== "connected") {
          stop();
          setStatus("Could not connect. Try watching from the same network as the casting computer.");
        }
      }, 25000);
      void tick();
    } catch { if (active) { stop(); setStatus("The cast is offline or your account has not been invited."); } }
  }

  return <section className="page">
    <header className="page-title"><div><p className="kicker">ANALYTICS · STAGING PILOT</p><h2>Live Sales Monitor</h2></div>
      <span role="status">{status}</span>
    </header>
    <div className="card">
      {canCast ? <>
        <label>Staging viewer emails <input type="text" value={emails} disabled={busy} onChange={event => setEmails(event.target.value)} placeholder="Up to 4 emails, separated by commas" /></label>
        {!preview && <button type="button" onClick={chooseTab}>Choose tab</button>}
        <div style={{ position: "relative", lineHeight: 0, overflow: "hidden" }} hidden={!preview || status === "Live"}>
        <video ref={source} autoPlay muted playsInline
          aria-label="Local preview. Drag to select the data area."
          style={{ display: "block", width: "100%", touchAction: "none", cursor: "crosshair" }}
          onPointerDown={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            drag.current = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
            event.currentTarget.setPointerCapture(event.pointerId);
            setCrop(null);
          }}
          onPointerUp={event => {
            if (!drag.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
            const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
            setCrop({ x: Math.min(x, drag.current.x), y: Math.min(y, drag.current.y),
              width: Math.abs(x - drag.current.x), height: Math.abs(y - drag.current.y) });
            drag.current = null;
          }} />
        {crop && <div aria-hidden="true" style={{ position: "absolute", pointerEvents: "none",
          left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`, border: "2px solid #38c6ff", boxShadow: "0 0 0 200vmax #0007" }} />}
        </div>
        {preview && status !== "Live" && <p>Drag over the data area, then check the crop before starting. Use sample data for this pilot.</p>}
        {preview && <button type="button" onClick={start} disabled={busy || !crop || !emails.trim()}>Start casting</button>}
      </> : <button type="button" onClick={watch} disabled={busy}>Watch live</button>}
      {(busy || preview) && <button type="button" onClick={stop}>{canCast ? "Stop" : "Leave"}</button>}
      <video ref={output} aria-label="Live Sales Monitor broadcast" autoPlay muted playsInline controls hidden={status !== "Live"}
        style={{ width: "100%", background: "#15212c" }} />
    </div>
  </section>;
}
