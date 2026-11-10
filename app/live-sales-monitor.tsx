"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const salesMonitorUrl = "/api/live-sales-monitor";
type Crop = { x: number; y: number; width: number; height: number };
type Peer = { id: string; token: string; offer: string; answered: boolean };
type Viewer = { email: string; name: string | null };
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
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [viewerError, setViewerError] = useState(false);
  const [viewerRetry, setViewerRetry] = useState(0);
  const [emails, setEmails] = useState<string[]>([]);
  const [grantedEmails, setGrantedEmails] = useState<string[]>([]);
  const hasAccessChanges = emails.length !== grantedEmails.length || emails.some(email => !grantedEmails.includes(email));
  const [roomId, setRoomId] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const roomRef = useRef("");
  const [search, setSearch] = useState("");
  const filteredViewers = viewers?.filter(viewer =>
    `${viewer.name ?? ""} ${viewer.email}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const [status, setStatus] = useState("Offline");
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    clean.current();
    clean.current = () => {};
    capture.current?.getTracks().forEach(track => track.stop());
    capture.current = null;
    if (source.current) source.current.srcObject = null;
    if (output.current) output.current.srcObject = null;
    roomRef.current = "";
    setRoomId("");
    setGrantedEmails([]);
    setEmails([]);
    setSavingAccess(false);
    setAccessMessage("");
    setPreview(false);
    setCrop(null);
    setStatus("Offline");
    setBusy(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clean.current();
      capture.current?.getTracks().forEach(track => track.stop());
      capture.current = null;
    };
  }, []);

  useEffect(() => {
    if (!canCast) return;
    const controller = new AbortController();
    setViewerError(false);
    fetch(`${salesMonitorUrl}?viewers`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Viewer list unavailable");
        const data: { viewers: Viewer[] } = await response.json();
        if (!controller.signal.aborted) setViewers(data.viewers);
      }).catch(() => { if (!controller.signal.aborted) setViewerError(true); });
    return () => controller.abort();
  }, [canCast, viewerRetry]);

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
      if (source.current) {
        source.current.srcObject = stream;
        void source.current.play().catch(() => setStatus("Could not play the selected tab."));
      }
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
    const media = canvas.captureStream(0);
    const castTrack = media.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    castTrack.contentHint = "detail";
    const draw = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (video.videoWidth !== originalWidth || video.videoHeight !== originalHeight) { stop(); return; }
      context.drawImage(video, crop.x * originalWidth, crop.y * originalHeight, canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height);
      castTrack.requestFrame();
    };
    draw();
    try {
      const { room } = await signal({ action: "start" });
      if (!room) throw Error("No room");
      if (!capture.current) {
        castTrack.stop();
        void signal({ action: "stop", room }).catch(() => {});
        return;
      }
      if (output.current) output.current.srcObject = media;
      const connections = new Map<string, RTCPeerConnection>();
      let running = true;
      let lastDraw = 0;
      let frameId = 0;
      const onFrame = (now: number) => {
        if (!running) return;
        if (now - lastDraw >= 65) {
          lastDraw = now;
          draw();
        }
        if (running) frameId = video.requestVideoFrameCallback(onFrame);
      };
      const frames = window.setInterval(() => {
        if (performance.now() - lastDraw >= 200) draw();
      }, 200);
      if (typeof video.requestVideoFrameCallback === "function") frameId = video.requestVideoFrameCallback(onFrame);
      let timer: number;
      let expiry: number;
      clean.current = () => {
        running = false;
        clearTimeout(timer);
        clearTimeout(expiry);
        clearInterval(frames);
        if (frameId) video.cancelVideoFrameCallback(frameId);
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
            const sender = connection.addTrack(castTrack, media);
            void (async () => {
              try {
                await connection.setRemoteDescription({ type: "offer", sdp: peer.offer });
                const answer = await gather(connection, await connection.createAnswer());
                const params = sender.getParameters();
                if (params.encodings.length) {
                  params.degradationPreference = "maintain-resolution";
                  params.encodings[0].maxBitrate = 6_000_000;
                  params.encodings[0].maxFramerate = 15;
                  void sender.setParameters(params).catch(() => {});
                }
                if (running && connections.get(peer.token) === connection) await signal({ action: "host", room, viewer: peer.id, token: peer.token, answer });
              } catch {
                connection.close();
                connections.delete(peer.token);
              }
            })();
          }
          if (running) timer = window.setTimeout(tick, 1500);
        } catch { if (running) stop(); }
      };
      roomRef.current = room;
      setRoomId(room);
      setStatus("Live");
      expiry = window.setTimeout(stop, 18000);
      void tick();
    } catch {
      media.getTracks().forEach(track => track.stop());
      setBusy(false);
      setStatus("Could not start. Check whether another session is live.");
    }
  }

  async function saveViewers(nextEmails: string[]) {
    if (!roomId || savingAccess) return;
    setSavingAccess(true);
    setAccessMessage("");
    try {
      await signal({ action: "viewers", room: roomId, emails: nextEmails });
      if (roomRef.current !== roomId) return;
      setEmails(nextEmails);
      setGrantedEmails(nextEmails);
      setAccessMessage(nextEmails.length ? "Viewer access updated." : "All viewer access revoked.");
    } catch {
      if (roomRef.current === roomId) setAccessMessage("Could not update viewer access. Try again.");
    } finally {
      if (roomRef.current === roomId) setSavingAccess(false);
    }
  }

  const watch = useCallback(async () => {
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
      if (output.current && active) {
        output.current.srcObject = event.streams[0];
        void output.current.play().catch(() => {
          if (!active) return;
          stop();
          setStatus("Live feed unavailable. Reconnect to try again.");
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (!active) return;

      if (peer.connectionState === "failed") { stop(); setStatus("Could not connect to the casting computer."); }
    };
    try {
      const offer = await gather(peer, await peer.createOffer());
      if (!active) return;
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
        if (active && !output.current?.videoWidth) {
          stop();
          setStatus("Could not connect. Try watching from the same network as the casting computer.");
        }
      }, 25000);
      void tick();
    } catch { if (active) { stop(); setStatus("The cast is offline or your account has not been invited."); } }
  }, [stop]);

  useEffect(() => {
    if (!canCast) void watch();
  }, [canCast, watch]);

  return <section className="page sales-cast">
    <header className="page-title"><div><p className="kicker">ANALYTICS · STAGING PILOT</p><h2>Live Sales Monitor</h2></div>
      <span className="period" role="status">{status}</span>
    </header>
    <div className="card sales-cast-card">
      {canCast ? <>
        <div className="sales-cast-setup">
          <fieldset disabled={!roomId || savingAccess}>
            <legend>Viewers <span>{emails.length} selected</span></legend>
            {!roomId && <p>Start casting to grant viewer access.</p>}
            <input type="search" aria-label="Find a viewer" placeholder="Search name or email" value={search} onChange={event => setSearch(event.target.value)} />
            {viewerError ? <p>Could not load users. <button type="button" onClick={() => setViewerRetry(value => value + 1)}>Retry</button></p>
              : !filteredViewers ? <p>Loading users…</p>
              : !filteredViewers.length ? <p>No matching users.</p>
              : <div className="sales-cast-viewers">{filteredViewers.map(viewer => {
                const email = viewer.email.toLowerCase();
                const checked = emails.includes(email);
                return <label key={email}>
                  <input type="checkbox" checked={checked}
                    onChange={() => setEmails(current => checked ? current.filter(value => value !== email) : [...current, email])} />
                  <span><strong>{viewer.name || viewer.email}</strong>{viewer.name && <small>{viewer.email}</small>}</span>
                </label>;
              })}</div>}
            {roomId && <div className="sales-cast-access-actions">
              <button type="button" disabled={!hasAccessChanges}
                onClick={() => void saveViewers(emails)}>Save access</button>
              {hasAccessChanges && <button type="button" onClick={() => setEmails(grantedEmails)}>Cancel changes</button>}
              <button type="button" disabled={!grantedEmails.length} onClick={() => void saveViewers([])}>Revoke all access</button>
            </div>}
            {grantedEmails.length > 0 && <div className="sales-cast-viewers" aria-label="Authorized viewers">
              <strong>Authorized viewers ({grantedEmails.length})</strong>
              {grantedEmails.map(email => <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0" }}>
                <span style={{ overflowWrap: "anywhere" }}>{email}</span>
                <button type="button" aria-label={`Revoke access for ${email}`}
                  onClick={() => void saveViewers(grantedEmails.filter(granted => granted !== email))}>Revoke access</button>
              </div>)}
            </div>}
            {accessMessage && <p role="status">{accessMessage}</p>}
          </fieldset>
          <div className="sales-cast-source">
            <h3>Share a tab</h3>
            <p>Choose the sales tab and outline the area viewers should see.</p>
            {!preview && <button type="button" onClick={chooseTab}>Choose tab</button>}
            {preview && <button className="sales-cast-primary" type="button" onClick={start} disabled={busy || !crop}>Start casting</button>}
            {(busy || preview) && <button type="button" onClick={stop}>Stop</button>}
          </div>
        </div>
        <div className="sales-cast-crop" hidden={!preview}>
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
      </> : !busy && <button type="button" onClick={watch}>Reconnect</button>}
      {!canCast && busy && status !== "Live" && <p role="status">Loading live sales…</p>}
      {!canCast && busy && status === "Live" && <button type="button" onClick={stop}>Leave</button>}
      <video ref={output} aria-label="Live Sales Monitor broadcast" autoPlay muted playsInline hidden={status !== "Live"}
        onPlaying={() => { if (!canCast) setStatus("Live"); }}
        style={{ maxWidth: "100%", height: "auto", justifySelf: "center" }} />
    </div>
  </section>;
}
