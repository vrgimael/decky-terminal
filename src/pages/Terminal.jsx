// Focus and lifecycle fixes ported from the locally verified plugin bundle.
// Kept as JavaScript so this initial fork preserves the working implementation.
import * as DFL from "@decky/ui";
import * as SP_REACT from "react";
import { call, addEventListener, removeEventListener } from "@decky/api";
import * as xtermExports from "@xterm/xterm";
import * as addonFitExports from "@xterm/addon-fit";
import XTermCSS from "../common/xterm_css";
import { FaArrowDown, FaArrowLeft, FaArrowRight, FaArrowUp, FaChevronCircleLeft, FaExpand, FaKeyboard, FaTerminal } from "react-icons/fa";
import { IconDialogButton } from "../common/components";

// Resolve Steam's context hook by behavior rather than a build-specific export name.
const useTerminalKeyboardManager = DFL.findModuleExport?.((value) =>
    typeof value === "function" && value.length === 0 &&
    /return\s*\([^;{}]*\)\?\.VirtualKeyboardManager\s*;?\s*\}/.test(value.toString())
) ?? (() => undefined);
const TerminalRouterContext = DFL.findModuleExport?.((value) =>
    value?.displayName === "Router" && value.Provider && value.Consumer
) ?? SP_REACT.createContext(null);
const Terminal = () => {
    const terminalRouter = SP_REACT.useContext(TerminalRouterContext);
    const keyboardManager = useTerminalKeyboardManager();
    const { id } = DFL.useParams();
    const [loaded, setLoaded] = SP_REACT.useState(false);
    const [fullScreen, setFullScreen] = SP_REACT.useState(false);
    const [shellExit, setShellExit] = SP_REACT.useState(null);
    const shellEndedRef = SP_REACT.useRef(false);
    const [title, setTitle] = SP_REACT.useState(null);
    const [config, setConfig] = SP_REACT.useState(null);
    const [openFunctionRow, setOpenFunctionRow] = SP_REACT.useState(false);
    // Create a ref to hold the xterm instance
    const xtermRef = SP_REACT.useRef(null);
    const xtermDiv = SP_REACT.useRef(null);
    const fakeInputRef = SP_REACT.useRef(null);
    const captureRef = SP_REACT.useRef(true);
    const terminalPageRef = SP_REACT.useRef(null);
    const keyboardVisibleRef = SP_REACT.useRef(false);
    const lifecycleRef = SP_REACT.useRef(null);
    const pendingTimersRef = SP_REACT.useRef(new Set());
    const pendingFramesRef = SP_REACT.useRef(new Set());
    const terminalRouterRef = SP_REACT.useRef(terminalRouter);
    terminalRouterRef.current = terminalRouter;
    const internalLocationRef = SP_REACT.useRef(terminalRouter?.history?.location ?? terminalRouter?.location ?? null);
    if (!terminalRouter?.history) internalLocationRef.current = terminalRouter?.location ?? null;
    const isCurrentSession = (session) => session?.alive && lifecycleRef.current === session;
    const isTerminalPageActive = () => {
        if (window.document.visibilityState === "hidden") return false;
        // Steam's memory/backstack route can differ from the browser URL.
        const location = terminalRouterRef.current?.history?.location ?? internalLocationRef.current;
        if (typeof location?.pathname === "string")
            return location.pathname === "/decky-terminal-focus/terminals/" + encodeURIComponent(id);
        // Keep visible mounted terminals usable if Steam changes its router exports.
        const page = terminalPageRef.current;
        return Boolean(page?.isConnected && page.getClientRects().length &&
            page.ownerDocument.defaultView.getComputedStyle(page).visibility !== "hidden");
    };
    const deferTerminalFrame = (callback) => {
        const session = lifecycleRef.current;
        const frame = requestAnimationFrame(() => {
            pendingFramesRef.current.delete(frame);
            if (isCurrentSession(session) && isTerminalPageActive()) callback();
        });
        pendingFramesRef.current.add(frame);
        return frame;
    };
    const deferTerminal = (callback, delay) => {
        const session = lifecycleRef.current;
        const timer = setTimeout(() => {
            pendingTimersRef.current.delete(timer);
            if (isCurrentSession(session) && isTerminalPageActive()) callback();
        }, delay);
        pendingTimersRef.current.add(timer);
        return timer;
    };
    const [captureInput, setCaptureInput] = SP_REACT.useState(true);
    SP_REACT.useEffect(() => {
        const history = terminalRouter?.history;
        internalLocationRef.current = history?.location ?? terminalRouter?.location ?? null;
        if (!history?.listen) {
            if (!internalLocationRef.current)
                console.warn("Decky Terminal Focus: router state unavailable; using mounted-page visibility");
            return;
        }
        const unlisten = history.listen((update) => {
            // This Steam build uses history v4; also accept the v5 update shape.
            internalLocationRef.current = update?.location ?? update;
            if (isTerminalPageActive()) return;
            for (const timer of pendingTimersRef.current) clearTimeout(timer);
            pendingTimersRef.current.clear();
            for (const frame of pendingFramesRef.current) cancelAnimationFrame(frame);
            pendingFramesRef.current.clear();
            lifecycleRef.current?.keyboardHeld?.clear();
        });
        return () => unlisten();
    }, [terminalRouter?.history, id]);
    const setTerminalCapture = (enabled) => {
        enabled = enabled && !shellEndedRef.current;
        captureRef.current = enabled;
        setCaptureInput(enabled);
        if (enabled && !keyboardVisibleRef.current && isTerminalPageActive()) xtermRef.current?.focus();
        else if (!enabled) xtermRef.current?.blur();
    };
    SP_REACT.useEffect(() => {
        const visibility = keyboardManager?.IsShowingVirtualKeyboard;
        if (!visibility?.Subscribe) {
            console.warn("Decky Terminal Focus: keyboard visibility tracking unavailable");
            return;
        }
        keyboardVisibleRef.current = Boolean(visibility.Value);
        let restoreFrame;
        let mounted = true;
        const subscription = visibility.Subscribe((visible) => {
            const wasVisible = keyboardVisibleRef.current;
            keyboardVisibleRef.current = Boolean(visible);
            if (visible && restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
            if (wasVisible && !visible) {
                restoreFrame = deferTerminalFrame(() => {
                    if (mounted && captureRef.current && !keyboardVisibleRef.current)
                        xtermRef.current?.focus();
                });
            }
        });
        return () => {
            mounted = false;
            if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
            subscription.Unsubscribe();
        };
    }, [keyboardManager, id]);
    const sendInput = async (input) => {
        const session = lifecycleRef.current;
        if (!isCurrentSession(session) || shellEndedRef.current || !isTerminalPageActive()) return;
        try { await call("send_terminal_input", session.id, input); }
        catch (error) { if (isCurrentSession(session)) console.warn("Decky Terminal Focus: input failed", error); }
    };
    const connectIO = async (session) => {
        const xterm = session.xterm;
        const localConfig = await call("get_config");
        if (!isCurrentSession(session)) return;
        setConfig(localConfig);
        if (!xterm.element) xterm.open(xtermDiv.current);
        if (localConfig?.__version__ === 1) {
            if (localConfig.font_family?.trim()) xterm.options.fontFamily = localConfig.font_family;
            const fontSize = parseInt(localConfig.font_size);
            if (Number.isFinite(fontSize) && fontSize > 0) xterm.options.fontSize = fontSize;
        }
        fitToScreen(false);
        const status = await call("get_terminal", session.id);
        if (!isCurrentSession(session)) return;
        if (status?.title) setTitle(status.title);
        session.disposables.push(xterm.onResize(({rows, cols}) => {
            if (isCurrentSession(session) && !shellEndedRef.current)
                call("change_terminal_window_size", session.id, rows, cols).catch(console.warn);
        }));
        session.disposables.push(xterm.onTitleChange((title) => {
            if (!isCurrentSession(session)) return;
            setTitle(title);
            call("set_terminal_title", session.id, title).catch(console.warn);
        }));
        session.disposables.push(xterm.onData((data) => {
            if (isCurrentSession(session)) sendInput(data);
        }));
        await call("change_terminal_window_size", session.id, xterm.rows, xterm.cols);
        if (!isCurrentSession(session)) return;
        session.outputListener = addEventListener(`terminal_output#${session.id}`, (data) => {
            if (isCurrentSession(session)) xterm.write(data);
        });
        session.subscribeStarted = true;
        await call("subscribe_terminal", session.id);
        if (!isCurrentSession(session)) {
            if (lifecycleRef.current?.id !== session.id)
                call("unsubscribe_terminal", session.id).catch(console.warn);
            return;
        }
        await call("send_terminal_buffer", session.id);
        if (!isCurrentSession(session)) return;
        setLoaded(true);
        if (captureRef.current && !shellEndedRef.current && !keyboardVisibleRef.current && isTerminalPageActive()) xterm.focus();
        const inputBox = fakeInputRef.current?.m_elInput;
        if (inputBox) {
            inputBox.tabIndex = -1;
            const focus = () => { if (isCurrentSession(session)) setFocusToTerminal(); };
            inputBox.addEventListener("click", focus);
            session.disposables.push({dispose: () => inputBox.removeEventListener("click", focus)});
        }
    };
    // First effect creates xterm instance
    SP_REACT.useEffect(() => {
        console.log('Creating xterm instance');
        const xterm = new xtermExports.Terminal({
            //scrollback: 0,
            allowProposedApi: true,
            cursorBlink: true,
            rows: 10,
        });
        console.log('XTermTerminal instance created');
        xtermRef.current = xterm;
        const session = { id, xterm, alive: true, disposables: [], outputListener: null, subscribeStarted: false };
        lifecycleRef.current = session;
        fitAddonRef.current = null;
        shellEndedRef.current = false;
        captureRef.current = true;
        setCaptureInput(true);
        setLoaded(false);
        setFullScreen(false);
        // Terminal input mode survives incidental loss of DOM focus.
        const terminalWindow = xtermDiv.current?.ownerDocument.defaultView ?? window;
        const keyboardCounts = new Map();
        const keyboardHeld = new Set();
        session.keyboardHeld = keyboardHeld;
        let inputDisposed = false;
        const terminalKeys = (evt) => {
            if (evt.type === "keyup") keyboardHeld.delete(evt.key);
            if (!isCurrentSession(session) || !isTerminalPageActive()) return;
            if (evt.key === "F10" && evt.ctrlKey && evt.shiftKey) {
                evt.preventDefault();
                evt.stopImmediatePropagation();
                if (evt.type === "keydown" && !evt.repeat)
                    setTerminalCapture(!captureRef.current);
                return;
            }
            if (evt.type === "keyup") keyboardHeld.delete(evt.key);
            if (!captureRef.current || keyboardVisibleRef.current || evt.isComposing) return;
            const suffix = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D", Home: "H", End: "F" }[evt.key];
            const modifier = 1 + Number(evt.shiftKey) + 2 * Number(evt.altKey) + 4 * Number(evt.ctrlKey) + 8 * Number(evt.metaKey);
            let sequence;
            if (suffix) {
                sequence = modifier > 1 ? "\x1b[1;" + modifier + suffix
                    : "\x1b" + (xterm.modes.applicationCursorKeysMode ? "O" : "[") + suffix;
            } else {
                sequence = { Enter: "\r", Escape: "\x1b", Tab: evt.shiftKey ? "\x1b[Z" : "\t", Backspace: "\x7f", Delete: "\x1b[3~", Insert: "\x1b[2~", PageUp: "\x1b[5~", PageDown: "\x1b[6~" }[evt.key];
            }
            if (sequence === undefined) {
                // Let xterm handle ordinary typing, paste, and input methods.
                if (evt.type === "keydown" && xterm.textarea && xterm.textarea.ownerDocument.activeElement !== xterm.textarea)
                    xterm.focus();
                return;
            }
            evt.preventDefault();
            evt.stopImmediatePropagation();
            if (evt.type === "keydown") {
                keyboardCounts.set(evt.key, (keyboardCounts.get(evt.key) ?? 0) + 1);
                keyboardHeld.add(evt.key);
                xterm.input(sequence, true);
            } else keyboardHeld.delete(evt.key);
        };
        // Capture Steam's original button event before its focus tree sees it.
        const steamTerminalInput = (evt) => {
            if (!isCurrentSession(session) || !isTerminalPageActive()) return;
            if (!captureRef.current || keyboardVisibleRef.current) return;
            const button = evt.detail?.button;
            const mapping = {
                [DFL.GamepadButton.DIR_UP]: ["ArrowUp", "A"],
                [DFL.GamepadButton.DIR_DOWN]: ["ArrowDown", "B"],
                [DFL.GamepadButton.DIR_LEFT]: ["ArrowLeft", "D"],
                [DFL.GamepadButton.DIR_RIGHT]: ["ArrowRight", "C"],
                [DFL.GamepadButton.OK]: ["Enter", "\r"],
                [DFL.GamepadButton.CANCEL]: ["Escape", "\x1b"]
            }[button];
            if (!mapping) return;
            evt.preventDefault();
            evt.stopImmediatePropagation();
            // Derived direction/confirm events must not send another copy.
            if (evt.type !== "vgp_onbuttondown") return;
            const [key, value] = mapping;
            const emit = () => {
                if (inputDisposed || !isCurrentSession(session) || !isTerminalPageActive() || !captureRef.current || keyboardVisibleRef.current || shellEndedRef.current) return;
                const sequence = key.startsWith("Arrow")
                    ? "\x1b" + (xterm.modes.applicationCursorKeysMode ? "O" : "[") + value : value;
                xterm.input(sequence, true);
            };
            // Steam labels keyboard-generated controller events as source 2.
            // Prefer the DOM keyboard event when both represent the same press.
            if (evt.detail.source === 2) {
                if (keyboardHeld.has(key)) return;
                const count = keyboardCounts.get(key) ?? 0;
                deferTerminal(() => {
                    if (!keyboardHeld.has(key) && (keyboardCounts.get(key) ?? 0) === count) emit();
                }, 0);
            } else emit();
        };
        const steamInputEvents = ["vgp_onbuttondown", "vgp_onbuttonup", "vgp_ondirection", "vgp_onok", "vgp_oncancel"];
        for (const type of steamInputEvents)
            terminalWindow.addEventListener(type, steamTerminalInput, true);
        const terminalPointer = (evt) => {
            if (!isCurrentSession(session) || !isTerminalPageActive()) return;
            if (evt.target.closest?.('[data-terminal-capture-toggle]')) return;
            if (xtermDiv.current?.contains(evt.target)) setTerminalCapture(true);
            else if (!keyboardVisibleRef.current && terminalPageRef.current?.contains(evt.target) && captureRef.current)
                setTerminalCapture(false);
        };
        terminalWindow.addEventListener("keydown", terminalKeys, true);
        terminalWindow.addEventListener("keyup", terminalKeys, true);
        terminalWindow.addEventListener("pointerdown", terminalPointer, true);
        return () => {
            inputDisposed = true;
            session.alive = false;
            for (const timer of pendingTimersRef.current) clearTimeout(timer);
            pendingTimersRef.current.clear();
            for (const frame of pendingFramesRef.current) cancelAnimationFrame(frame);
            pendingFramesRef.current.clear();
            keyboardHeld.clear();
            for (const type of steamInputEvents)
                terminalWindow.removeEventListener(type, steamTerminalInput, true);
            terminalWindow.removeEventListener("keydown", terminalKeys, true);
            terminalWindow.removeEventListener("keyup", terminalKeys, true);
            terminalWindow.removeEventListener("pointerdown", terminalPointer, true);
            if (session.outputListener) removeEventListener(`terminal_output#${session.id}`, session.outputListener);
            for (const disposable of session.disposables) disposable.dispose();
            session.disposables.length = 0;
            if (session.subscribeStarted) call("unsubscribe_terminal", session.id).catch(console.warn);
            xterm.dispose();
            if (xtermRef.current === xterm) xtermRef.current = null;
            if (lifecycleRef.current === session) lifecycleRef.current = null;
            fitAddonRef.current = null;
        };
    }, [id]);
    // A layout change must never disconnect or clear the terminal.
    SP_REACT.useEffect(() => {
        const session = lifecycleRef.current;
        connectIO(session).catch((error) => {
            if (isCurrentSession(session)) console.error("Decky Terminal Focus: connection failed", error);
        });
    }, [id]);
    SP_REACT.useEffect(() => {
        let stopped = false;
        let timer;
        shellEndedRef.current = false;
        setShellExit(null);
        const checkShell = async () => {
            try {
                const status = await call("get_terminal", id);
                if (stopped) return;
                if (status === null || status?.is_completed) {
                    shellEndedRef.current = true;
                    setShellExit(status?.exitcode ?? "unknown");
                    setFullScreen(false);
                    setTerminalCapture(false);
                    return;
                }
            } catch (error) {
                console.warn("Decky Terminal Focus: could not check shell status", error);
            }
            if (!stopped) timer = setTimeout(checkShell, 1000);
        };
        checkShell();
        return () => { stopped = true; clearTimeout(timer); };
    }, [id]);
    const openKeyboard = () => {
        if (config?.disable_virtual_keyboard) {
            setFocusToTerminal();
            return;
        }
        const fakeInput = fakeInputRef.current;
        if (fakeInput?.m_elInput) {
            fakeInput.m_elInput.click();
        }
        else {
            fakeInput?.click?.();
        }
    };
    const setFocusToTerminal = () => {
        setTerminalCapture(true);
        deferTerminal(() => {
            if (captureRef.current && !keyboardVisibleRef.current) xtermRef.current?.focus();
        }, 100);
    };
    // Track FitAddon instance globally so we don't create multiple instances
    const fitAddonRef = SP_REACT.useRef(null);
    const fitToScreen = (_fullScreen) => {
        const isFullScreen = _fullScreen === undefined ? fullScreen : _fullScreen;
        if (xtermRef.current) {
            const xterm = xtermRef.current;
            // Use existing FitAddon or create new one
            if (!fitAddonRef.current) {
                console.log('Creating new FitAddon');
                fitAddonRef.current = new addonFitExports.FitAddon();
                xterm.loadAddon(fitAddonRef.current);
            }
            const res = fitAddonRef.current.proposeDimensions();
            if (res?.rows && res.cols) {
                const fontSize = xterm.options.fontSize ?? 12;
                const colOffset = (Math.ceil(30 / fontSize));
                const newCols = Math.max(2, isFullScreen ? res.cols - colOffset : res.cols + colOffset);
                let newRows = isFullScreen ? res.rows - 1 : res.rows;
                if (config?.extra_keys) {
                    newRows -= 3;
                }
                console.log('Resizing terminal:', { newCols, newRows, isFullScreen });
                xterm.resize(newCols, Math.max(1, newRows));
            }
        }
    };
    SP_REACT.useEffect(() => {
        if (!loaded) return;
        const frame = deferTerminalFrame(() => fitToScreen(fullScreen));
        return () => { cancelAnimationFrame(frame); pendingFramesRef.current.delete(frame); };
    }, [fullScreen, loaded, shellExit, id]);
    const startFullScreen = () => {
        if (shellEndedRef.current) return;
        setTerminalCapture(true);
        setFullScreen(true);
    };
    const exitFullScreen = () => {
        setFullScreen(false);
        setTerminalCapture(false);
    };
    const gamepadHandler = (evt) => {
        if (isTerminalPageActive() && config?.use_dpad && captureRef.current && !keyboardVisibleRef.current) {
            evt.preventDefault();
            evt.stopPropagation();
            let command = undefined;
            switch (evt.detail.button) {
                case DFL.GamepadButton.DIR_UP:
                    command = '\x1b[A';
                    break;
                case DFL.GamepadButton.DIR_DOWN:
                    command = '\x1b[B';
                    break;
                case DFL.GamepadButton.DIR_RIGHT:
                    command = '\x1b[C';
                    break;
                case DFL.GamepadButton.DIR_LEFT:
                    command = '\x1b[D';
                    break;
            }
            if (command) {
                sendInput(command);
                xtermRef.current?.focus();
            }
        }
    };
    const terminalButton = (evt, sequence) => {
        if (!isTerminalPageActive() || !captureRef.current || keyboardVisibleRef.current) return false;
        evt.preventDefault();
        evt.stopPropagation();
        xtermRef.current?.input(sequence, true);
        xtermRef.current?.focus();
    };
    const getPadding = () => {
        let amount = fullScreen ? 7 : 5;
        if (!fullScreen) {
            amount += 6;
        }
        if (config?.handheld_mode) {
            const row = 47;
            const allRows = row * 5;
            const padding = 3;
            const final = allRows + padding;
            // remove bottom bar padding
            amount -= 2.5;
            return 'calc(' + amount + 'em + ' + final + 'px)';
        }
        if (!fullScreen) {
            if (config?.extra_keys) {
                amount += 3;
            }
        }
        return amount + 'em';
    };
    const ModifiedTextField = DFL.TextField;
    return (window.SP_REACT.createElement(DFL.Focusable, { disableNavSounds: captureInput, noFocusRing: true, onGamepadDirection: gamepadHandler, onCancelButton: (evt) => terminalButton(evt, "\x1b"), onOKButton: (evt) => terminalButton(evt, "\r"), style: { margin: 0, padding: 0, paddingTop: "2.5rem", color: "white", width: '100vw' } },
        window.SP_REACT.createElement("div", { ref: terminalPageRef, style: { padding: fullScreen ? "0" : "0 1rem", } },
            window.SP_REACT.createElement(XTermCSS, null),
            window.SP_REACT.createElement(DFL.DialogButton, { disableNavSounds: captureInput,
                "data-terminal-capture-toggle": "true",
                disabled: shellExit !== null,
                style: { minHeight: "24px", padding: "2px 8px", fontSize: "12px" },
                onClick: () => setTerminalCapture(!captureRef.current)
            }, shellExit !== null ? "Shell exited — Steam navigation active" : captureInput ? "Terminal input captured — Ctrl+Shift+F10 releases" : "Steam navigation active — click here or terminal to capture"),
            fullScreen && window.SP_REACT.createElement(DFL.DialogButton, {
                disableNavSounds: captureInput,
                style: { minHeight: "28px", padding: "2px 8px", fontSize: "12px" },
                onClick: exitFullScreen
            }, "Exit fullscreen"),
            shellExit !== null && window.SP_REACT.createElement("div", { role: "status", style: { padding: "8px" } },
                "Shell exited (" + shellExit + "). Input released; use Steam Back to leave this terminal."),
            (!fullScreen) ? window.SP_REACT.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' } },
                window.SP_REACT.createElement("h1", { style: { margin: '1rem 0', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'ellipsis' } }, title),
                window.SP_REACT.createElement(DFL.Focusable, { disableNavSounds: captureInput, style: { fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' } },
                    !config?.disable_virtual_keyboard ?
                        window.SP_REACT.createElement(DFL.DialogButton, { disableNavSounds: captureInput, style: { minWidth: '1rem' }, onClick: openKeyboard },
                            window.SP_REACT.createElement(FaKeyboard, null)) :
                        window.SP_REACT.createElement(DFL.DialogButton, { disableNavSounds: captureInput, style: { minWidth: '1rem' }, onClick: setFocusToTerminal },
                            window.SP_REACT.createElement(FaTerminal, null)),
                    window.SP_REACT.createElement(DFL.DialogButton, { disableNavSounds: captureInput, style: { minWidth: '1rem' }, onClick: startFullScreen },
                        window.SP_REACT.createElement(FaExpand, null)))) : window.SP_REACT.createElement("div", null),
            config?.disable_virtual_keyboard && fullScreen ?
                window.SP_REACT.createElement(DFL.DialogButton, { disableNavSounds: captureInput, style: { visibility: 'hidden', zIndex: -10, position: 'absolute' }, onClick: setFocusToTerminal }) :
                window.SP_REACT.createElement(ModifiedTextField, { disableNavSounds: captureInput, ref: fakeInputRef, disabled: config?.disable_virtual_keyboard ?? false, style: { display: 'none' }, onClick: setFocusToTerminal }),
            window.SP_REACT.createElement(DFL.Focusable, { disableNavSounds: captureInput, onClick: openKeyboard, style: { boxSizing: 'content-box', overflow: 'hidden' } },
                window.SP_REACT.createElement("div", { ref: xtermDiv, style: { width: '100%', maxWidth: '100vw', margin: 0, background: '#000', padding: 0, height: "calc(100vh - " + getPadding() + ")" } })),
            (config?.extra_keys && (!fullScreen || config?.handheld_mode)) &&
                window.SP_REACT.createElement(DFL.Focusable, { disableNavSounds: captureInput, style: { overflowX: 'scroll', display: 'flex', gap: '1rem', padding: '.5rem', width: 'fit-content', maxWidth: 'calc(100% - 2rem)', margin: '0 auto' } },
                    window.SP_REACT.createElement("div", { style: { display: 'flex', justifyContent: 'center', gap: '.5rem' } },
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b') }, "Esc")),
                    window.SP_REACT.createElement("div", { style: { display: 'flex', justifyContent: 'center', gap: '.5rem' } },
                        openFunctionRow &&
                            window.SP_REACT.createElement("div", { style: { display: 'flex', justifyContent: 'center', gap: '.25rem' } },
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[1P') }, "F1"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[1Q') }, "F2"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[1R') }, "F3"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[1S') }, "F4"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[15~') }, "F5"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[17~') }, "F6"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[18~') }, "F7"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[19~') }, "F8"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[20~') }, "F9"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[21~') }, "F10"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[23~') }, "F11"),
                                window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[24~') }, "F12")),
                        openFunctionRow ?
                            window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => setOpenFunctionRow(false) },
                                window.SP_REACT.createElement(FaChevronCircleLeft, null)) :
                            window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => setOpenFunctionRow(true) }, "Fn")),
                    window.SP_REACT.createElement("div", { style: { display: 'flex', justifyContent: 'center', gap: '.5rem' } },
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[D') },
                            window.SP_REACT.createElement(FaArrowLeft, null)),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[A') },
                            window.SP_REACT.createElement(FaArrowUp, null)),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[B') },
                            window.SP_REACT.createElement(FaArrowDown, null)),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1b[C') },
                            window.SP_REACT.createElement(FaArrowRight, null))),
                    window.SP_REACT.createElement("div", { style: { display: 'flex', justifyContent: 'center', gap: '.5rem' } },
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x03') }, "^C"),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x04') }, "^D"),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x12') }, "^R"),
                        window.SP_REACT.createElement(IconDialogButton, { disableNavSounds: captureInput, onClick: () => sendInput('\x1a') }, "^Z"))),
            config?.handheld_mode &&
                window.SP_REACT.createElement(DFL.Focusable, { disableNavSounds: captureInput, style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingTop: fullScreen ? '1em' : '2em' } },
                    window.SP_REACT.createElement("div", { className: DFL.staticClasses.Text }, "Reserved for Virtual Keyboard"),
                    window.SP_REACT.createElement("div", { className: DFL.staticClasses.Label }, "Disable Handheld mode to remove this padding")))));
};

export default Terminal;
