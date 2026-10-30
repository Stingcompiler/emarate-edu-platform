import { Gauge, Loader2, Play, RotateCcw, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";

/**
 * The lecture player (owner, 2026-10-30: «تصميمه بدائي»), after the lesson pages of learning
 * platforms (Coursera, Udemy, YouTube): a dark 16:9 stage with a start screen (play, title,
 * source), a spinner while the signed link loads, a retry on failure; for the college's own
 * recordings a speed choice and «تابع من حيث توقفت» (the position is kept on this device).
 * A YouTube link among the resources plays inside the page, in an iframe (youtube-nocookie). No video at all: a
 * short line, not an empty frame.
 */

const SPEEDS = [1, 1.25, 1.5, 2];

/** The id of a YouTube video from its usual addresses, else null. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/);
      return m ? m[2]! : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

type Source =
  | { kind: "hosted"; id: string; provider: string; status: string }
  | { kind: "youtube"; id: string }
  | null;

export function LecturePlayer({ title, source }: { title: string; source: Source }) {
  if (!source)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-4 py-4 text-sm text-text-muted">
        <VideoOff size={20} aria-hidden className="shrink-0" />
        لا تسجيل مرئي لهذه المحاضرة — محتواها في الموارد أدناه.
      </div>
    );
  if (source.kind === "youtube") return <YouTube id={source.id} title={title} />;
  return <Hosted title={title} {...source} />;
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-navy-900 text-white shadow-sm">
      {children}
    </div>
  );
}

function StartScreen({
  title,
  label,
  onPlay,
  busy = false,
  failed = false,
  note,
}: {
  title: string;
  label: string;
  onPlay?: () => void;
  busy?: boolean;
  failed?: boolean;
  note?: string;
}) {
  return (
    <Stage>
      <button
        type="button"
        // Not a form: while loading (or processing) the tap simply does nothing.
        onClick={busy ? undefined : onPlay}
        aria-busy={busy}
        aria-label={failed ? "أعد محاولة التشغيل" : `تشغيل: ${title}`}
        className="group absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center aria-busy:cursor-default"
      >
        <span className="grid size-16 place-items-center rounded-full bg-white/95 text-navy-900 shadow-lg transition-transform group-hover:scale-105 group-aria-busy:scale-100 sm:size-20">
          {busy ? (
            <Loader2 size={30} aria-hidden className="animate-spin" />
          ) : failed ? (
            <RotateCcw size={28} aria-hidden />
          ) : (
            <Play size={32} aria-hidden className="ms-1 fill-current rtl:-scale-x-100" />
          )}
        </span>
        <span>
          <span className="block text-base font-bold sm:text-lg">{title}</span>
          <span className="mt-1 block text-xs text-white/70 sm:text-sm">
            {failed ? "تعذّر تحميل التسجيل — اضغط لإعادة المحاولة" : label}
          </span>
          {note && <span className="mt-1 block text-xs text-white/70">{note}</span>}
        </span>
      </button>
    </Stage>
  );
}

/** A YouTube video plays right here, in YouTube's own player (privacy-enhanced domain). */
function YouTube({ id, title }: { id: string; title: string }) {
  return (
    <Stage>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1`}
        title={title}
        className="absolute inset-0 size-full border-0"
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </Stage>
  );
}

const POS = (id: string) => `ecst-pos-${id}`;

function Hosted({
  id,
  provider,
  status,
  title,
}: {
  id: string;
  provider: string;
  status: string;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const video = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const saved = (() => {
    try {
      return Number(localStorage.getItem(POS(id)) ?? 0);
    } catch {
      return 0;
    }
  })();
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed, url]);
  if (status !== "ready")
    return <StartScreen title={title} label="التسجيل قيد المعالجة — يظهر هنا حين يجهز" busy />;
  const load = async () => {
    setBusy(true);
    setFailed(false);
    const { data } = await api.GET("/api/v1/videos/{public_id}/playback", {
      params: { path: { public_id: id } },
    });
    setBusy(false);
    if (data?.url) setUrl(data.url);
    else setFailed(true);
  };
  if (!url)
    return (
      <StartScreen
        title={title}
        label="تسجيل المحاضرة"
        note={saved > 5 ? `تابع من ${clock(saved)}` : undefined}
        onPlay={load}
        busy={busy}
        failed={failed}
      />
    );
  if (provider === "bunny")
    return (
      <Stage>
        <iframe
          src={url}
          title={title}
          className="absolute inset-0 size-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </Stage>
    );
  return (
    <div>
      <Stage>
        <video
          ref={video}
          src={url}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 size-full bg-black"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (saved > 5 && saved < v.duration - 10) v.currentTime = saved;
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            if (Math.abs(t - lastSaved.current) < 5) return;
            lastSaved.current = t;
            try {
              localStorage.setItem(POS(id), String(Math.floor(t)));
            } catch {
              /* private mode: no resume */
            }
          }}
          onEnded={() => {
            try {
              localStorage.removeItem(POS(id));
            } catch {
              /* nothing kept */
            }
          }}
        />
      </Stage>
      <div
        role="radiogroup"
        aria-label="سرعة التشغيل"
        className="mt-2 flex items-center justify-end gap-1 text-xs"
      >
        <Gauge size={16} aria-hidden className="me-1 text-text-muted" />
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => setSpeed(s)}
            className={`min-h-9 min-w-11 rounded-md px-2 font-semibold ${
              speed === s
                ? "bg-primary-soft text-primary-700"
                : "text-text-muted hover:bg-surface-alt"
            }`}
          >
            <bdi>{s}×</bdi>
          </button>
        ))}
      </div>
    </div>
  );
}
