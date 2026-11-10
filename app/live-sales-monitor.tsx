"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const salesMonitorUrl = "/api/live-sales-monitor";
const castConnectionConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
};
type Crop = { x: number; y: number; width: number; height: number };
type Peer = { id: string; token: string; offer: string; answered: boolean };
type Viewer = { email: string; name: string | null };
type Signal = { iceServers?: RTCIceServer[]; room?: string; token?: string; answer?: string; peers?: Peer[] };

async function signal(body: object): Promise<Signal> {
  const response = await fetch(salesMonitorUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error(String(response.status));
  return response.json();
}

function createPeer(iceServers: RTCIceServer[] = []) {
  return new RTCPeerConnection({ iceServers: [...(castConnectionConfig.iceServers ?? []), ...iceServers] });
}

async function gather(peer: RTCPeerConnection, sdp: RTCSessionDescriptionInit) {
  await peer.setLocalDescription(sdp);
  if (peer.iceGatheringState !== "complete") {
    await new Promise<void>(resolve => {
      const check = () => {
        if (peer.iceGatheringState === "complete") {
          clearTimeout(timer);
          peer.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      const timer = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
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
  const [savedSelection, setSavedSelection] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("");
  const savedViewers = roomId ? grantedEmails : savedSelection;
  const hasAccessChanges = emails.length !== savedViewers.length || emails.some(email => !savedViewers.includes(email));
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
    setSavedSelection([]);
    setEmails([]);
    setSavingAccess(false);
    setAccessMessage("");
    setPreview(false);
    setCrop(null);
    setStatus("Offline");
    setBusy(false);
  }, [setStatus]);

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
    fetch(`${salesMonitorUrl}?viewers`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Viewer list unavailable");
        const data: { viewers: Viewer[] } = await response.json();
        if (!controller.signal.aborted) {
          setViewers(data.viewers);
          setViewerError(false);
        }
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
      let hostConfig: Signal | undefined;
      const connections = new Map<string, RTCPeerConnection>();
      let running = true;
      let lastDraw = 0;
      let frameId = 0;
      const onFrame = (now: number) => {
        if (!running) return;
        if (now - lastDraw >= 200) {
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
          hostConfig ??= await signal({ action: "connect", room });
          if (!running) return;
          clearTimeout(expiry);
          expiry = window.setTimeout(stop, 18000);
          for (const [token, connection] of connections) {
            if (!peers.some(peer => peer.token === token)) { connection.close(); connections.delete(token); }
          }
          for (const peer of peers) {
            if (!running) return;
            if (connections.has(peer.token)) continue;
            const connection = createPeer(hostConfig.iceServers);
            connections.set(peer.token, connection);
            const sender = connection.addTrack(castTrack, media);
            void (async () => {
              try {
                await connection.setRemoteDescription({ type: "offer", sdp: peer.offer });
                const answer = await gather(connection, await connection.createAnswer());
                const params = sender.getParameters();
                if (params.encodings.length) {
                  params.degradationPreference = "maintain-resolution";
                  params.encodings[0].maxBitrate = 900_000;
                  params.encodings[0].maxFramerate = 5;
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
        } catch {
          if (running) timer = window.setTimeout(tick, 2500);
        }
      };
      roomRef.current = room;
      setRoomId(room);
      setAccessMessage("");
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
    if (savingAccess) return;
    if (!roomId) {
      setSavedSelection(nextEmails);
      setAccessMessage("Selection saved. Start casting, then save access to let them watch.");
      return;
    }
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

  const watch = useCallback(() => {
    clean.current();
    let active = true;
    let timer: number;
    let peer: RTCPeerConnection | undefined;
    let attempt = 0;
    clean.current = () => {
      active = false;
      clearTimeout(timer);
      peer?.close();
    };
    const connect = async () => {
      setBusy(true);
      setStatus("Connecting…");
      const id = ++attempt;
      const current = () => active && id === attempt;
      const retry = (message: string) => {
        if (!current()) return;
        attempt++;
        clearTimeout(timer);
        peer?.close();
        if (output.current) output.current.srcObject = null;
        setStatus(message);
        timer = window.setTimeout(connect, 5000);
      };
      try {
        const { room, iceServers } = await signal({ action: "connect" });
        if (!current()) return;
        if (!room) throw Error("Missing room");
        const connection = createPeer(iceServers);
        peer = connection;
        connection.addTransceiver("video", { direction: "recvonly" });
        connection.ontrack = event => {
          if (!current() || !output.current) return;
          output.current.srcObject = event.streams[0];
          void output.current.play().catch(() => retry("Reconnecting…"));
        };
        connection.onconnectionstatechange = () => {
          if (connection.connectionState === "failed") retry("Reconnecting…");
        };
        const offer = await gather(connection, await connection.createOffer());
        if (!current()) return;
        const { token } = await signal({ action: "join", room, offer });
        const deadline = Date.now() + 18000;
        const tick = async () => {
          if (!current()) return;
          try {
            const { answer } = await signal({ action: "watch", room, token });
            if (!current()) return;
            if (answer && !connection.currentRemoteDescription) {
              await connection.setRemoteDescription({ type: "answer", sdp: answer });
            }
            if (!current()) return;
            const state = connection.connectionState;
            if (Date.now() > deadline && (state !== "connected" || !output.current?.videoWidth)) {
              retry("Reconnecting…");
              return;
            }
            timer = window.setTimeout(tick, 2000);
          } catch { retry("Waiting for live sales…"); }
        };
        void tick();
      } catch { retry("Waiting for live sales…"); }
    };
    void connect();
  }, []);

  useEffect(() => {
    if (!canCast) {
      watch();
      return () => clean.current();
    }
  }, [canCast, watch]);

  return <section className="page sales-cast">
    <header className="page-title"><div><p className="kicker">ANALYTICS · STAGING PILOT</p><h2>Live Sales Monitor</h2></div>
      <span className="period" role="status">{status}</span>
    </header>
    <div className="card sales-cast-card">
      {canCast ? <>
        <div className="sales-cast-setup">
          <fieldset disabled={savingAccess}>
            <legend>Viewers <span>{emails.length} selected</span></legend>
            {!roomId && <p>Save a viewer selection now. After you start casting and check the preview, choose Save access to let them watch.</p>}
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
            <div className="sales-cast-access-actions">
              <button type="button" disabled={!hasAccessChanges}
                onClick={() => void saveViewers(emails)}>{roomId ? "Save access" : "Save selection"}</button>
              {hasAccessChanges && <button type="button" onClick={() => setEmails(savedViewers)}>Cancel changes</button>}
              <button type="button" disabled={!roomId || !grantedEmails.length} onClick={() => void saveViewers([])}>Revoke all access</button>
            </div>
            <div className="sales-cast-viewers" aria-label="Authorized viewers">
              <strong>Authorized viewers ({grantedEmails.length})</strong>
              {!grantedEmails.length && <p>No viewers have access yet.</p>}
              {grantedEmails.map(email => <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0" }}>
                <span style={{ overflowWrap: "anywhere" }}>{email}</span>
                <button type="button" aria-label={`Revoke access for ${email}`}
                  onClick={() => void saveViewers(grantedEmails.filter(granted => granted !== email))}>Revoke access</button>
              </div>)}
            </div>
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
