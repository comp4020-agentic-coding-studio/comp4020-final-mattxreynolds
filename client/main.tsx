import { createRoot } from "react-dom/client";
import { initAudio } from "./audio.ts";
import { watchInputKind } from "./scene/touch.ts";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

initAudio();
watchInputKind();
createRoot(document.getElementById("root")!).render(<App />);
