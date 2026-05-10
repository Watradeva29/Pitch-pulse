function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function authorizeUmpireForJoinedMatch(socket, requestedCode) {
  const joinedCode = normalizeCode(socket?.data?.code);
  if (socket?.data?.role !== "umpire" || !joinedCode) {
    return { ok: false, error: "Only umpire can control the match." };
  }

  const explicitCode = normalizeCode(requestedCode);
  if (explicitCode && explicitCode !== joinedCode) {
    return { ok: false, error: "Umpire is not authorized for that match." };
  }

  return { ok: true, code: joinedCode };
}

module.exports = {
  authorizeUmpireForJoinedMatch,
  normalizeCode,
};
