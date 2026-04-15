import "./App.css";
import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import SetupMatch from "./pages/SetupMatch";
import JoinMatch from "./pages/JoinMatch";
import MatchUmpire from "./pages/MatchUmpire";
import MatchSpectator from "./pages/MatchSpectator";
import ShareMatch from "./pages/ShareMatch";
import Toss from "./pages/Toss";
import MatchScorecard from "./pages/MatchScorecard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/setup" element={<SetupMatch />} />
      <Route path="/join/:code" element={<JoinMatch />} />
      <Route path="/match/:code/share" element={<ShareMatch />} />
      <Route path="/match/:code/toss" element={<Toss />} />
      <Route path="/match/:code/umpire" element={<MatchUmpire />} />
      <Route path="/match/:code/spectator" element={<MatchSpectator />} />
      <Route path="/match/:code/scorecard" element={<MatchScorecard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
