// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
const BUTTONS = [
    "left" /* Protocol.Input.MouseButton.Left */,
    "middle" /* Protocol.Input.MouseButton.Middle */,
    "right" /* Protocol.Input.MouseButton.Right */,
    "back" /* Protocol.Input.MouseButton.Back */,
    "forward" /* Protocol.Input.MouseButton.Forward */,
];
const MOUSE_EVENT_TYPES = {
    mousedown: "mousePressed" /* Protocol.Input.DispatchMouseEventRequestType.MousePressed */,
    mouseup: "mouseReleased" /* Protocol.Input.DispatchMouseEventRequestType.MouseReleased */,
    mousemove: "mouseMoved" /* Protocol.Input.DispatchMouseEventRequestType.MouseMoved */,
};
export class InputModel extends SDK.SDKModel.SDKModel {
    inputAgent;
    runtimeAgent;
    activeMouseOffsetTop;
    constructor(target) {
        super(target);
        this.inputAgent = target.inputAgent();
        this.runtimeAgent = target.runtimeAgent();
        this.activeMouseOffsetTop = null;
    }
    async handleCopyShortcut() {
        try {
          const result = await this.runtimeAgent.invoke_evaluate({ expression: 'navigator.clipboard.readText()', awaitPromise: true });
          if (result.result.type === 'string') {
            const clipboardText = result.result.value;
            await navigator.clipboard.writeText(clipboardText);
          }
        } catch (error) {
          console.error('Error reading clipboard text:', error);
        }
      }

    async handlePasteShortcut()  {
        try {
          const clipboardText = await navigator.clipboard.readText();
          void this.inputAgent.invoke_insertText({
            text: clipboardText,
          });
        } catch (error) {
          console.error('Error pasting clipboard text:', error);
        }
    }
    emitKeyEvent(event) {
        let type;
        switch (event.type) {
            case 'keydown':
                type = "keyDown" /* Protocol.Input.DispatchKeyEventRequestType.KeyDown */;
                break;
            case 'keyup':
                type = "keyUp" /* Protocol.Input.DispatchKeyEventRequestType.KeyUp */;
                break;
            case 'keypress':
                type = "char" /* Protocol.Input.DispatchKeyEventRequestType.Char */;
                break;
            default:
                return;
        }
        const text = event.type === 'keypress' ? String.fromCharCode(event.charCode) : undefined;

        if (type === Protocol.Input.DispatchKeyEventRequestType.KeyDown &&
            ((event.ctrlKey || event.metaKey) && event.key === 'v')) {
            void this.handlePasteShortcut();
            return;
        }
        if (event.key == "Meta") {
            const controlEvent = new KeyboardEvent(event.type, {
                key: 'Control',
                keyCode: 17,
                code: 'ControlLeft',
                ctrlKey: true,
                metaKey: false,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                bubbles: true,
                cancelable: true,
            });
            void this.inputAgent.invoke_dispatchKeyEvent({
                type: type,
                modifiers: this.modifiersForEvent(controlEvent),
                text: text,
                unmodifiedText: text ? text.toLowerCase() : undefined,
                keyIdentifier: controlEvent.keyIdentifier,
                code: controlEvent.code,
                key: controlEvent.key,
                windowsVirtualKeyCode: controlEvent.keyCode,
                nativeVirtualKeyCode: controlEvent.keyCode,
                autoRepeat: controlEvent.repeat,
                isKeypad: controlEvent.location === 3,
                isSystemKey: false,
                location: controlEvent.location !== 3 ? controlEvent.location : undefined,
            });
            return;
        }
        if (((event.metaKey) && event.key === 'c')) {
            const cEvent1 = new KeyboardEvent("keyDown", {
              key: 'c',
              code: 'KeyC',
              keyCode: 67,
              ctrlKey: true,
              metaKey: false,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              bubbles: true,
              cancelable: true,
            });
            const cEvent2 = new KeyboardEvent("keypress", {
                key: 'c',
                code: 'KeyC',
                keyCode: 3,
                charCode: 3,
                ctrlKey: true,
                metaKey: false,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                bubbles: true,
                cancelable: true,
              });
              const cEvent3 = new KeyboardEvent("keyUp", {
                key: 'c',
                code: 'KeyC',
                keyCode: 67,
                ctrlKey: true,
                metaKey: false,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                bubbles: true,
                cancelable: true,
              });
            const txt1 = cEvent1.type === 'keypress' ? String.fromCharCode(cEvent1.charCode) : undefined;
            void this.inputAgent.invoke_dispatchKeyEvent({
                type: type,
                modifiers: this.modifiersForEvent(cEvent1),
                text: txt1,
                unmodifiedText: txt1 ? txt1.toLowerCase() : undefined,
                keyIdentifier: cEvent1.keyIdentifier,
                code: cEvent1.code,
                key: cEvent1.key,
                windowsVirtualKeyCode: cEvent1.keyCode,
                nativeVirtualKeyCode: cEvent1.keyCode,
                autoRepeat: cEvent1.repeat,
                isKeypad: cEvent1.location === 3,
                isSystemKey: false,
                location: cEvent1.location !== 3 ? cEvent1.location : undefined,
            });
            const txt2 = cEvent2.type === 'keypress' ? String.fromCharCode(cEvent2.charCode) : undefined;
            void this.inputAgent.invoke_dispatchKeyEvent({
                type: type,
                modifiers: this.modifiersForEvent(cEvent2),
                text: txt2,
                unmodifiedText: txt2 ? txt2.toLowerCase() : undefined,
                keyIdentifier: cEvent2.keyIdentifier,
                code: cEvent2.code,
                key: cEvent2.key,
                windowsVirtualKeyCode: cEvent2.keyCode,
                nativeVirtualKeyCode: cEvent2.keyCode,
                autoRepeat: cEvent2.repeat,
                isKeypad: cEvent2.location === 3,
                isSystemKey: false,
                location: cEvent2.location !== 3 ? cEvent2.location : undefined,
            });
            const txt3 = cEvent3.type === 'keypress' ? String.fromCharCode(cEvent3.charCode) : undefined;
            void this.inputAgent.invoke_dispatchKeyEvent({
                type: type,
                modifiers: this.modifiersForEvent(cEvent3),
                text: txt3,
                unmodifiedText: txt3 ? txt3.toLowerCase() : undefined,
                keyIdentifier: cEvent3.keyIdentifier,
                code: cEvent3.code,
                key: cEvent3.key,
                windowsVirtualKeyCode: cEvent3.keyCode,
                nativeVirtualKeyCode: cEvent3.keyCode,
                autoRepeat: cEvent3.repeat,
                isKeypad: cEvent3.location === 3,
                isSystemKey: false,
                location: cEvent3.location !== 3 ? cEvent3.location : undefined,
            });
            setTimeout(() => this.handleCopyShortcut(), 500);
            return;
        }

        void this.inputAgent.invoke_dispatchKeyEvent({
            type: type,
            modifiers: this.modifiersForEvent(event),
            text: text,
            unmodifiedText: text ? text.toLowerCase() : undefined,
            keyIdentifier: event.keyIdentifier,
            code: event.code,
            key: event.key,
            windowsVirtualKeyCode: event.keyCode,
            nativeVirtualKeyCode: event.keyCode,
            autoRepeat: event.repeat,
            isKeypad: event.location === 3,
            isSystemKey: false,
            location: event.location !== 3 ? event.location : undefined,
        });
        if (type === Protocol.Input.DispatchKeyEventRequestType.KeyUp && ((event.ctrlKey) && event.key === 'c')) {
        setTimeout(() => this.handleCopyShortcut(), 500)
        }
    }
    emitMouseEvent(event, offsetTop, zoom) {
        if (!(event.type in MOUSE_EVENT_TYPES)) {
            return;
        }
        if (event.type === 'mousedown' || this.activeMouseOffsetTop === null) {
            this.activeMouseOffsetTop = offsetTop;
        }
        void this.inputAgent.invoke_dispatchMouseEvent({
            type: MOUSE_EVENT_TYPES[event.type],
            x: Math.round(event.offsetX / zoom),
            y: Math.round(event.offsetY / zoom - this.activeMouseOffsetTop),
            modifiers: this.modifiersForEvent(event),
            button: BUTTONS[event.button],
            clickCount: event.detail,
        });
        if (event.type === 'mouseup') {
            this.activeMouseOffsetTop = null;
        }
    }
    emitWheelEvent(event, offsetTop, zoom) {
        if (this.activeMouseOffsetTop === null) {
            this.activeMouseOffsetTop = offsetTop;
        }
        void this.inputAgent.invoke_dispatchMouseEvent({
            type: "mouseWheel" /* Protocol.Input.DispatchMouseEventRequestType.MouseWheel */,
            x: Math.round(event.offsetX / zoom),
            y: Math.round(event.offsetY / zoom - this.activeMouseOffsetTop),
            modifiers: this.modifiersForEvent(event),
            button: BUTTONS[event.button],
            clickCount: event.detail,
            deltaX: event.deltaX / zoom,
            deltaY: event.deltaY / zoom,
        });
    }
    modifiersForEvent(event) {
        return Number(event.getModifierState('Alt')) | (Number(event.getModifierState('Control')) << 1) |
            (Number(event.getModifierState('Meta')) << 2) | (Number(event.getModifierState('Shift')) << 3);
    }
}
SDK.SDKModel.SDKModel.register(InputModel, {
    capabilities: 1024 /* SDK.Target.Capability.Input */,
    autostart: false,
});
//# sourceMappingURL=InputModel.js.map