// The page runs on ONE GSAP instance (npm), shared by the React layer and the viewer. Also on window for the
// e2e suite (test_everything.js checks the libraries) and the browser console.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollToPlugin);
Object.assign(window, { gsap, ScrollTrigger, SplitText, Lenis });
