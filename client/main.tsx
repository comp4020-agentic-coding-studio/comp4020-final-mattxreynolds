import { createRoot } from "react-dom/client";
import { initAudio } from "./audio.ts";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

initAudio();
createRoot(document.getElementById("root")!).render(<App />);
