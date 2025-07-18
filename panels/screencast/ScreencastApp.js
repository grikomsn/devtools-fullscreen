// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from "../../core/common/common.js";
import * as i18n from "../../core/i18n/i18n.js";
import * as SDK from "../../core/sdk/sdk.js";
import * as UI from "../../ui/legacy/legacy.js";
import { ScreencastView } from "./ScreencastView.js";
const UIStrings = {
    /**
     *@description Tooltip text that appears when hovering over largeicon phone button in Screencast App of the Remote Devices tab when toggling screencast
     */
    toggleScreencast: "Toggle screencast",
};
const str_ = i18n.i18n.registerUIStrings("panels/screencast/ScreencastApp.ts", UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let appInstance;
export class ScreencastApp {
    enabledSetting;
    toggleButton;
    screenCaptureModel;
    screencastView;
    rootView;
    constructor() {
        this.enabledSetting = Common.Settings.Settings.instance().createSetting("screencast-enabled", true);
        this.toggleButton = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.toggleScreencast), "devices");
        this.toggleButton.setToggled(this.enabledSetting.get());
        this.toggleButton.setEnabled(false);
        this.toggleButton.addEventListener("Click" /* UI.Toolbar.ToolbarButton.Events.Click */, this.toggleButtonClicked, this);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.ScreenCaptureModel.ScreenCaptureModel, this);
    }
    static instance() {
        if (!appInstance) {
            appInstance = new ScreencastApp();
        }
        return appInstance;
    }
    presentUI(document) {
        this.rootView = new UI.RootView.RootView();
        this.rootView.attachToDocument(document);
        this.rootView.focus();
    }
    modelAdded(screenCaptureModel) {
        if (screenCaptureModel.target() !==
            SDK.TargetManager.TargetManager.instance().primaryPageTarget()) {
            return;
        }
        this.screenCaptureModel = screenCaptureModel;
        this.toggleButton.setEnabled(true);
        this.screencastView = new ScreencastView(screenCaptureModel);
        if (this?.rootView?.element) {
            this.screencastView.show(this.rootView.element);
        }
        this.screencastView.initialize();
        this.onScreencastEnabledChanged();
    }
    modelRemoved(screenCaptureModel) {
        if (this.screenCaptureModel !== screenCaptureModel) {
            return;
        }
        delete this.screenCaptureModel;
        this.toggleButton.setEnabled(false);
        if (this.screencastView) {
            this.screencastView.detach();
            delete this.screencastView;
        }
        this.onScreencastEnabledChanged();
    }
    toggleButtonClicked() {
        const enabled = !this.toggleButton.toggled();
        this.enabledSetting.set(enabled);
        this.onScreencastEnabledChanged();
    }
    onScreencastEnabledChanged() {
        const enabled = Boolean(this.enabledSetting.get() && this.screencastView);
        this.toggleButton.setToggled(enabled);
    }
}
let toolbarButtonProviderInstance;
export class ToolbarButtonProvider {
    static instance(opts = { forceNew: false }) {
        const { forceNew } = opts;
        if (!toolbarButtonProviderInstance || forceNew) {
            toolbarButtonProviderInstance = new ToolbarButtonProvider();
        }
        return toolbarButtonProviderInstance;
    }
    item() {
        return ScreencastApp.instance().toggleButton;
    }
}
let screencastAppProviderInstance;
export class ScreencastAppProvider {
    static instance(opts = { forceNew: false }) {
        const { forceNew } = opts;
        if (!screencastAppProviderInstance || forceNew) {
            screencastAppProviderInstance = new ScreencastAppProvider();
        }
        return screencastAppProviderInstance;
    }
    createApp() {
        return ScreencastApp.instance();
    }
}
//# sourceMappingURL=ScreencastApp.js.map