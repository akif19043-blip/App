"use client";

import { Camera, CameraOff, Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Room as LiveKitRoom } from "livekit-client";
import type { StreamStatus } from "@/types/domain";

type Mode = "loading" | "livekit" | "local-preview" | "placeholder" | "error";

/**
 * The video layer. With LiveKit configured the host publishes camera + mic
 * over WebRTC and viewers subscribe through the SFU (sub-second latency).
 * Without it, the host sees a local camera preview and viewers a poster, so
 * the rest of the room still works in development.
 */
export function VideoStage({
  streamId,
  isHost,
  status,
  poster,
}: {
  streamId: string;
  isHost: boolean;
  status: StreamStatus;
  poster: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<LiveKitRoom | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const live = status === "live";

  useEffect(() => {
    if (!live) {
      setMode("placeholder");
      return;
    }
    let cancelled = false;
    let localStream: MediaStream | null = null;

    (async () => {
      const res = await fetch(`/api/livekit/token?streamId=${streamId}`, { cache: "no-store" });
      const cfg = (await res.json()) as { enabled: boolean; url?: string; token?: string };
      if (cancelled) return;

      if (!cfg.enabled) {
        if (!isHost) return setMode("placeholder");
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
          if (cancelled) return localStream.getTracks().forEach((t) => t.stop());
          if (videoRef.current) videoRef.current.srcObject = localStream;
          setMode("local-preview");
        } catch {
          setMode("placeholder");
        }
        return;
      }

      const { Room, RoomEvent, Track, VideoPresets } = await import("livekit-client");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution, facingMode: "user" },
      });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            setHasRemoteVideo(true);
          } else if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el !== videoRef.current && el.remove());
          if (track.kind === Track.Kind.Video) setHasRemoteVideo(false);
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));

      try {
        await room.connect(cfg.url!, cfg.token!);
        if (cancelled) return room.disconnect();
        if (isHost) {
          await room.localParticipant.enableCameraAndMicrophone();
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track && videoRef.current) pub.track.attach(videoRef.current);
        }
        setAudioBlocked(!room.canPlaybackAudio);
        setMode("livekit");
      } catch (err) {
        console.error(err);
        setError(isHost ? "Nie udało się uruchomić kamery lub połączyć z serwerem wideo." : "Nie udało się połączyć z wideo.");
        setMode("error");
      }
    })().catch(() => setMode("error"));

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [streamId, isHost, live]);

  const showVideo = mode === "local-preview" || (mode === "livekit" && (isHost || hasRemoteVideo));

  return (
    <div className="absolute inset-0 bg-neutral-950">
      {/* Poster: the current item, blurred, behind everything. */}
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-900/40 via-transparent to-orange-900/40" />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isHost}
        className={`absolute inset-0 size-full object-cover transition-opacity ${showVideo ? "opacity-100" : "opacity-0"} ${isHost ? "-scale-x-100" : ""}`}
      />

      {!showVideo && (
        <div className="absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 px-8 text-center text-white/80">
          {mode === "loading" ? (
            <Loader2 className="size-8 animate-spin" />
          ) : status === "upcoming" ? (
            <p className="text-lg font-semibold">Transmisja wkrótce się zacznie</p>
          ) : status === "ended" ? (
            <p className="text-lg font-semibold">Transmisja zakończona</p>
          ) : mode === "error" ? (
            <p className="text-sm">{error}</p>
          ) : mode === "livekit" ? (
            <p className="text-sm">Czekamy na obraz od sprzedawcy…</p>
          ) : (
            <p className="max-w-xs text-xs text-white/60">
              Tryb demo — wideo WebRTC działa po ustawieniu LIVEKIT_URL, LIVEKIT_API_KEY i LIVEKIT_API_SECRET.
            </p>
          )}
        </div>
      )}

      {audioBlocked && !isHost && (
        <button
          onClick={() => roomRef.current?.startAudio()}
          className="absolute left-1/2 top-24 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          <Volume2 className="size-4" /> Włącz dźwięk
        </button>
      )}

      {isHost && mode === "livekit" && (
        <div className="absolute right-3 top-20 z-20 flex flex-col gap-2">
          <button
            aria-label={camOn ? "Wyłącz kamerę" : "Włącz kamerę"}
            className="grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
            onClick={async () => {
              await roomRef.current?.localParticipant.setCameraEnabled(!camOn);
              setCamOn(!camOn);
            }}
          >
            {camOn ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
          </button>
          <button
            aria-label={micOn ? "Wycisz mikrofon" : "Włącz mikrofon"}
            className="grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
            onClick={async () => {
              await roomRef.current?.localParticipant.setMicrophoneEnabled(!micOn);
              setMicOn(!micOn);
            }}
          >
            {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
