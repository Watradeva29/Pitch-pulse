function normalizeCode(code) {
  return String(code || "").toUpperCase();
}

function isUmpireForMatch(socket, code, match) {
  const c = normalizeCode(code);
  if (!socket || !c || !match) return false;
  if (socket.data?.role !== "umpire") return false;
  if (normalizeCode(socket.data?.code) !== c) return false;

  // If a lock is recorded, only that active umpire socket may mutate the match.
  if (match.umpireSocketId && match.umpireSocketId !== socket.id) return false;
  return true;
}

module.exports = {
  isUmpireForMatch,
};
