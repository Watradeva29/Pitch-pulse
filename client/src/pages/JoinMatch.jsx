import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

export default function JoinMatch() {
  const nav = useNavigate();
  const { code } = useParams();
  const [sp] = useSearchParams();

  useEffect(() => {
    const c = String(code || "").trim().toUpperCase();
    if (!c) {
      nav("/");
      return;
    }
    const role = String(sp.get("role") || "").toLowerCase();
    const key = sp.get("key") || "";
    if (role === "umpire" && key) {
      nav(`/match/${encodeURIComponent(c)}/umpire?key=${encodeURIComponent(key)}`, { replace: true });
      return;
    }
    nav(`/match/${encodeURIComponent(c)}/spectator`, { replace: true });
  }, [code, nav, sp]);

  return null;
}

