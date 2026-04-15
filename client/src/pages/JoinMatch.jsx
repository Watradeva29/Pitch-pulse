import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function JoinMatch() {
  const nav = useNavigate();
  const { code } = useParams();

  useEffect(() => {
    const c = String(code || "").trim().toUpperCase();
    if (!c) {
      nav("/");
      return;
    }
    nav(`/match/${encodeURIComponent(c)}/spectator`, { replace: true });
  }, [code, nav]);

  return null;
}

