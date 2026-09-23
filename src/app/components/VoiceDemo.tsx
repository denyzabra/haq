"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import FlowPanel, { type PostCallState } from "./FlowPanel";
import { CLAUSE_PATTERN } from "./flows";
import styles from "./VoiceDemo.module.css";

const MAX_SECONDS = 300;
const LIVE_POLL_MS = 3000;
const AFTER_CALL_POLL_MS = 4000;
const AFTER_CALL_WINDOW_MS = 2 * 60 * 1000;

type Phase = "idle" | "preparing" | "connecting" | "live" | "ended";
type Lang = "en" | "ar";
interface Line {
  id: number;
  role: "user" | "agent";
  text: string;
}
interface Notice {
  kind: "info" | "error";
  text: string;
}

export default function VoiceDemo() {
  return (
    <ConversationProvider>
      <Demo />
    </ConversationProvider>
  );
}

function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. To talk to HAQ, allow microphone access for this site in your browser (usually the icon in the address bar), then press Start again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Connect a microphone and press Start again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Your microphone is in use by another app or could not be started. Close the other app and press Start again.";
  }
  return "The microphone could not be started. Check your browser settings and press Start again.";
}

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Demo() {
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lit, setLit] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [postCall, setPostCall] = useState<PostCallState>("idle");

  const litRef = useRef<Record<number, string>>({});
  const lineId = useRef(0);
  const deadline = useRef<number | null>(null);
  const endedAt = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  // Keeps the ref (read by SDK callbacks and listeners) in step with the rendered phase.
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const conversationIdRef = useRef<string | null>(null);

  const light = useCallback((flow: number, at: string = new Date().toISOString()) => {
    if (litRef.current[flow]) return;
    litRef.current = { ...litRef.current, [flow]: at };
    setLit(litRef.current);
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => {
      conversationIdRef.current = id;
      setConversationId(id);
      deadline.current = Date.now() + MAX_SECONDS * 1000;
      setSecondsLeft(MAX_SECONDS);
      setPhase("live");
      light(2);
    },
    onDisconnect: () => {
      if (phaseRef.current === "idle") return;
      endedAt.current = Date.now();
      deadline.current = null;
      setPhase("ended");
      // Without a conversation id there is nothing to wait for.
      setPostCall(!conversationIdRef.current ? "idle" : litRef.current[9] ? "recorded" : "waiting");
    },
    onMessage: ({ role, message }) => {
      const text = message?.trim();
      if (!text) return;
      setLines((prev) => [...prev, { id: ++lineId.current, role, text }]);
      if (role === "user") light(1);
      if (role === "agent" && litRef.current[4] && CLAUSE_PATTERN.test(text)) light(5);
    },
    onError: () => {
      setNotice({ kind: "error", text: "The voice session had a problem and may have ended. You can press Start to try again." });
    },
  });

  const endSessionRef = useRef(conversation.endSession);
  useEffect(() => {
    endSessionRef.current = conversation.endSession;
  }, [conversation.endSession]);

  const start = useCallback(
    async (lang: Lang) => {
      if (phaseRef.current === "preparing" || phaseRef.current === "connecting" || phaseRef.current === "live") return;
      setNotice(null);
      setLines([]);
      setConversationId(null);
      conversationIdRef.current = null;
      litRef.current = {};
      setLit({});
      setPostCall("idle");
      endedAt.current = null;
      setPhase("preparing");

      // Check the microphone before asking for a token, so a blocked
      // microphone never uses up one of the limited demo sessions.
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice({ kind: "error", text: "This browser cannot use a microphone on this page. Please use a current version of Chrome, Edge, Safari or Firefox." });
        setPhase("idle");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        setNotice({ kind: "error", text: micErrorMessage(error) });
        setPhase("idle");
        return;
      }

      let body: { token?: string; message?: string } = {};
      let status = 0;
      try {
        const res = await fetch("/api/conversation-token", { method: "POST", cache: "no-store" });
        status = res.status;
        body = await res.json().catch(() => ({}));
      } catch {
        status = 0;
      }
      if (status === 429) {
        setNotice({ kind: "info", text: body.message ?? "The demo is busy right now. Please try again later." });
        setPhase("idle");
        return;
      }
      if (status !== 200 || !body.token) {
        setNotice({ kind: "info", text: "The demo is not available right now. Please try again later." });
        setPhase("idle");
        return;
      }

      setPhase("connecting");
      conversation.startSession({
        conversationToken: body.token,
        connectionType: "webrtc",
        ...(lang === "ar" ? { overrides: { agent: { language: "ar" } } } : {}),
      });
    },
    [conversation, setPhase],
  );

  const stop = useCallback(() => {
    endSessionRef.current();
  }, []);

  // Hard stop at the 300 second cap (the agent's max duration is a second backstop).
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => {
      if (deadline.current === null) return;
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) {
        setNotice({ kind: "info", text: "The session reached the 5 minute limit and has ended." });
        endSessionRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // End the session cleanly if the page is closed or hidden for navigation.
  useEffect(() => {
    const end = () => {
      if (phaseRef.current === "live" || phaseRef.current === "connecting") endSessionRef.current();
    };
    window.addEventListener("pagehide", end);
    window.addEventListener("beforeunload", end);
    return () => {
      window.removeEventListener("pagehide", end);
      window.removeEventListener("beforeunload", end);
    };
  }, []);

  // Poll the server side flow events for this conversation only: during the
  // session, then for up to two minutes afterwards while waiting for flow 9.
  useEffect(() => {
    if (!conversationId) return;
    const polling = phase === "live" || (phase === "ended" && postCall === "waiting");
    if (!polling) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/flows/${encodeURIComponent(conversationId)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { flows?: { flow: number; at: string }[] } = await res.json();
        for (const f of data.flows ?? []) light(f.flow, f.at);
        if (litRef.current[9]) setPostCall("recorded");
      } catch {
        // Network hiccup: try again on the next tick.
      }
      if (
        !cancelled &&
        phaseRef.current === "ended" &&
        !litRef.current[9] &&
        endedAt.current !== null &&
        Date.now() - endedAt.current >= AFTER_CALL_WINDOW_MS
      ) {
        setPostCall("missing");
      }
    };
    poll();
    const timer = setInterval(poll, phase === "live" ? LIVE_POLL_MS : AFTER_CALL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId, phase, postCall, light]);

  const busy = phase === "preparing" || phase === "connecting";
  const active = phase === "live" || phase === "connecting";
  const statusText = {
    idle: "Not connected.",
    preparing: "Checking your microphone and preparing a session.",
    connecting: "Connecting to HAQ.",
    live: `Connected. Speak when you are ready. Time left ${formatClock(secondsLeft)}.`,
    ended: "Session ended.",
  }[phase];

  return (
    <div className={styles.grid}>
      <section className={styles.controls} aria-labelledby="try-heading">
        <h2 id="try-heading">Try HAQ</h2>
        <p className={styles.help}>
          Press a start button and allow microphone access. HAQ will ask for your consent first. A session lasts at most 5 minutes.
        </p>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={() => start("en")} disabled={busy || active}>
            Start in English
          </button>
          <button type="button" className={styles.primary} onClick={() => start("ar")} disabled={busy || active}>
            <span lang="ar" dir="rtl">
              ابدأ بالعربية
            </span>
            <span className={styles.subLabel}>Start in Arabic</span>
          </button>
          <button type="button" className={styles.secondary} onClick={stop} disabled={!active}>
            Stop
          </button>
        </div>
        <p className={styles.status} role="status" aria-live="polite">
          {statusText}
        </p>
        {notice && (
          <p className={notice.kind === "error" ? styles.noticeError : styles.noticeInfo} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        )}
      </section>

      <section className={styles.transcript} aria-labelledby="transcript-heading">
        <h2 id="transcript-heading">Live transcript</h2>
        <div className={styles.lines} aria-live="polite" aria-relevant="additions">
          {lines.length === 0 ? (
            <p className={styles.empty}>The conversation will appear here.</p>
          ) : (
            lines.map((line) => (
              <p key={line.id} className={line.role === "user" ? styles.userLine : styles.agentLine}>
                <span className={styles.speaker}>{line.role === "user" ? "You" : "HAQ"}</span>
                <span dir="auto">{line.text}</span>
              </p>
            ))
          )}
        </div>
      </section>

      <aside className={styles.flows} aria-labelledby="flows-heading">
        <FlowPanel lit={lit} phase={phase} postCall={postCall} />
      </aside>

      <section className={styles.diagram} aria-labelledby="diagram-heading">
        <h2 id="diagram-heading">How HAQ works</h2>
        <p className={styles.help}>The numbers 1 to 9 on this diagram are the same as in the live flow panel.</p>
        <figure className={styles.figure}>
          <Image
            src="/haq-architecture.png"
            alt="HAQ architecture in three zones. Zone 1, caller and channel: the tenant or landlord speaks to the web widget (flow 1). Zone 2, ElevenLabs platform: audio and session id go to the Router (flow 2), which passes intent and fields to the Rule sub agent (flow 3). Rule sends area, unit, rent and date to the index service and gets the index average and tier back (flow 4), then gives the spoken answer with the clause cited (flow 5). Confirmed facts only go to Paperwork (flow 6), whose only tool prepares a draft and case reference in the draft store (flow 7). The human gate sends a transfer and summary to the human queue, the only path to filing (flow 8). After the call, the post call webhook sends transcript, scores, tool log and consent to the hash chained audit ledger (flow 9). Twilio telephony is pilot phase only."
            width={2100}
            height={1344}
            sizes="(max-width: 900px) 100vw, 60vw"
            className={styles.image}
          />
          <figcaption className={styles.caption}>Architecture of HAQ. Telephony is pilot phase only and is not part of this demo.</figcaption>
        </figure>
      </section>
    </div>
  );
}
