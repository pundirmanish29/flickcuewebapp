import { useEffect, useRef, useState } from "react";
import { requestLetterboxdStatus, requestLetterboxdSync, type LetterboxdStatusResult } from "./letterboxdConnection";

/** Keep the card current while visible, and discard responses after a profile/account change. */
export function useLetterboxdConnection(email: string, username: string) {
  const [check, setCheck] = useState(0);
  const [state, setState] = useState<{ key: string; result: LetterboxdStatusResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const pendingStart = useRef(false);
  const key = `${email}\n${username}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => { setError(""); }, [key]);
  useEffect(() => {
    if (!username) return;
    let live = true;
    let pending = false;
    setLoading(true);
    const read = async () => {
      if (pending) return;
      pending = true;
      const result = await requestLetterboxdStatus(email, username);
      pending = false;
      if (live) { setState({ key, result }); setLoading(false); }
    };
    const visible = () => { if (document.visibilityState === "visible") void read(); };
    void read();
    const timer = setInterval(visible, 15_000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [key, email, username, check]);
  const startSync = async (enable = false) => {
    if (pendingStart.current) return;
    pendingStart.current = true; setStarting(true); setError("");
    try {
      const result = await requestLetterboxdSync(email, username, enable);
      if (currentKey.current !== key) return;
      if (result.ok) { setState({ key, result: { profile: result.profile } }); setCheck(value => value + 1); }
      else setError(result.error);
    } finally { pendingStart.current = false; setStarting(false); }
  };
  return { result: state?.key === key ? state.result : null, loading, starting, error, startSync, refresh: () => setCheck(value => value + 1) };
}
