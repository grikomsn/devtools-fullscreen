/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as TraceEngine from '../../models/trace/trace.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';
import { ActiveFilters } from './ActiveFilters.js';
import { CompatibilityTracksAppender } from './CompatibilityTracksAppender.js';
import * as Components from './components/components.js';
import { initiatorsDataToDraw } from './Initiators.js';
import { ThreadAppender } from './ThreadAppender.js';
import timelineFlamechartPopoverStyles from './timelineFlamechartPopover.css.js';
import { FlameChartStyle, Selection } from './TimelineFlameChartView.js';
import { TimelineSelection } from './TimelineSelection.js';
import { TimelineUIUtils } from './TimelineUIUtils.js';
const UIStrings = {
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     */
    onIgnoreList: 'On ignore list',
    /**
     * @description Text in Timeline Flame Chart Data Provider of the Performance panel *
     * @example{example.com} PH1
     */
    mainS: 'Main — {PH1}',
    /**
     * @description Text that refers to the main target
     */
    main: 'Main',
    /**
     * @description Text in Timeline Flame Chart Data Provider of the Performance panel * @example {https://example.com} PH1
     */
    frameS: 'Frame — {PH1}',
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     */
    subframe: 'Subframe',
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     */
    raster: 'Raster',
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     *@example {2} PH1
     */
    rasterizerThreadS: 'Rasterizer Thread {PH1}',
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     */
    thread: 'Thread',
    /**
     *@description Text for rendering frames
     */
    frames: 'Frames',
    /**
     * @description Text in the Performance panel to show how long was spent in a particular part of the code.
     * The first placeholder is the total time taken for this node and all children, the second is the self time
     * (time taken in this node, without children included).
     *@example {10ms} PH1
     *@example {10ms} PH2
     */
    sSelfS: '{PH1} (self {PH2})',
    /**
     *@description Text in Timeline Flame Chart Data Provider of the Performance panel
     */
    idleFrame: 'Idle Frame',
    /**
     *@description Text in Timeline Frame Chart Data Provider of the Performance panel
     */
    droppedFrame: 'Dropped Frame',
    /**
     *@description Text in Timeline Frame Chart Data Provider of the Performance panel
     */
    partiallyPresentedFrame: 'Partially Presented Frame',
    /**
     *@description Text for a rendering frame
     */
    frame: 'Frame',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/TimelineFlameChartDataProvider.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TimelineFlameChartDataProvider extends Common.ObjectWrapper.ObjectWrapper {
    droppedFramePatternCanvas;
    partialFramePatternCanvas;
    timelineDataInternal;
    currentLevel;
    // The Performance and the Timeline models are expected to be
    // deprecated in favor of using traceEngineData (new RPP engine) only
    // as part of the work in crbug.com/1386091. For this reason they
    // have the "legacy" prefix on their name.
    legacyPerformanceModel;
    compatibilityTracksAppender;
    legacyTimelineModel;
    traceEngineData;
    isCpuProfile = false;
    /**
     * Raster threads are tracked and enumerated with this property. This is also
     * used to group all raster threads together in the same track, instead of
     * rendering a track for thread.
     */
    #rasterCount = 0;
    minimumBoundaryInternal;
    timeSpan;
    headerLevel1;
    headerLevel2;
    staticHeader;
    framesHeader;
    screenshotsHeader;
    entryData;
    entryTypeByLevel;
    screenshotImageCache;
    entryIndexToTitle;
    asyncColorByCategory;
    lastInitiatorEntry;
    entryParent;
    lastSelection;
    colorForEvent;
    #eventToDisallowRoot = new WeakMap();
    #font;
    #eventIndexByEvent = new WeakMap();
    constructor() {
        super();
        this.reset();
        this.#font = `${PerfUI.Font.DEFAULT_FONT_SIZE} ${PerfUI.Font.getFontFamilyForCanvas()}`;
        this.droppedFramePatternCanvas = document.createElement('canvas');
        this.partialFramePatternCanvas = document.createElement('canvas');
        this.preparePatternCanvas();
        this.timelineDataInternal = null;
        this.currentLevel = 0;
        this.legacyPerformanceModel = null;
        this.legacyTimelineModel = null;
        this.compatibilityTracksAppender = null;
        this.traceEngineData = null;
        this.minimumBoundaryInternal = 0;
        this.timeSpan = 0;
        this.headerLevel1 = this.buildGroupStyle({ shareHeaderLine: false });
        this.headerLevel2 = this.buildGroupStyle({ padding: 2, nestingLevel: 1, collapsible: false });
        this.staticHeader = this.buildGroupStyle({ collapsible: false });
        this.framesHeader = this.buildGroupStyle({ useFirstLineForOverview: true });
        this.screenshotsHeader =
            this.buildGroupStyle({ useFirstLineForOverview: true, nestingLevel: 1, collapsible: false, itemsHeight: 150 });
        ThemeSupport.ThemeSupport.instance().addEventListener(ThemeSupport.ThemeChangeEvent.eventName, () => {
            const headers = [
                this.headerLevel1,
                this.headerLevel2,
                this.staticHeader,
                this.framesHeader,
                this.screenshotsHeader,
            ];
            for (const header of headers) {
                header.color = ThemeSupport.ThemeSupport.instance().getComputedValue('--sys-color-on-surface');
                header.backgroundColor =
                    ThemeSupport.ThemeSupport.instance().getComputedValue('--sys-color-cdt-base-container');
            }
        });
    }
    modifyTree(group, node, action) {
        const entry = this.entryData[node];
        this.compatibilityTracksAppender?.modifyTree(group, entry, action);
    }
    findPossibleContextMenuActions(group, node) {
        const entry = this.entryData[node];
        return this.compatibilityTracksAppender?.findPossibleContextMenuActions(group, entry);
    }
    buildGroupStyle(extra) {
        const defaultGroupStyle = {
            padding: 4,
            height: 17,
            collapsible: true,
            color: ThemeSupport.ThemeSupport.instance().getComputedValue('--sys-color-on-surface'),
            backgroundColor: ThemeSupport.ThemeSupport.instance().getComputedValue('--sys-color-cdt-base-container'),
            nestingLevel: 0,
            shareHeaderLine: true,
        };
        return Object.assign(defaultGroupStyle, extra);
    }
    setModel(performanceModel, newTraceEngineData, isCpuProfile = false) {
        this.reset();
        this.legacyPerformanceModel = performanceModel;
        this.legacyTimelineModel = performanceModel && performanceModel.timelineModel();
        this.traceEngineData = newTraceEngineData;
        this.isCpuProfile = isCpuProfile;
        if (newTraceEngineData) {
            const { traceBounds } = newTraceEngineData.Meta;
            const minTime = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(traceBounds.min);
            const maxTime = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(traceBounds.max);
            this.minimumBoundaryInternal = minTime;
            this.timeSpan = minTime === maxTime ? 1000 : maxTime - this.minimumBoundaryInternal;
        }
    }
    /**
     * Instances and caches a CompatibilityTracksAppender using the
     * internal flame chart data and the trace parsed data coming from the
     * trace engine.
     * The model data must have been set to the data provider instance before
     * attempting to instance the CompatibilityTracksAppender.
     */
    compatibilityTracksAppenderInstance(forceNew = false) {
        if (!this.compatibilityTracksAppender || forceNew) {
            if (!this.traceEngineData || !this.legacyTimelineModel) {
                throw new Error('Attempted to instantiate a CompatibilityTracksAppender without having set the trace parse data first.');
            }
            this.timelineDataInternal = this.#instantiateTimelineData();
            this.compatibilityTracksAppender = new CompatibilityTracksAppender(this.timelineDataInternal, this.traceEngineData, this.entryData, this.entryTypeByLevel, this.legacyTimelineModel);
        }
        return this.compatibilityTracksAppender;
    }
    /**
     * Returns the instance of the timeline flame chart data, without
     * adding data to it. In case the timeline data hasn't been instanced
     * creates a new instance and returns it.
     */
    #instantiateTimelineData() {
        if (!this.timelineDataInternal) {
            this.timelineDataInternal = PerfUI.FlameChart.FlameChartTimelineData.createEmpty();
        }
        return this.timelineDataInternal;
    }
    /**
     * Builds the flame chart data using the track appenders
     */
    buildFromTrackAppenders(options) {
        if (!this.compatibilityTracksAppender) {
            return;
        }
        const appenders = this.compatibilityTracksAppender.allVisibleTrackAppenders();
        for (const appender of appenders) {
            const skipThreadAppenderByName = appender instanceof ThreadAppender && !appender.trackName().includes(options?.filterThreadsByName || '');
            if (skipThreadAppenderByName) {
                continue;
            }
            const expanded = Boolean(options?.expandedTracks?.has(appender.appenderName));
            this.currentLevel = appender.appendTrackAtLevel(this.currentLevel, expanded);
        }
    }
    groupTrack(group) {
        return group.track || null;
    }
    groupTreeEvents(group) {
        return this.compatibilityTracksAppender?.groupEventsForTreeView(group) ?? null;
    }
    mainFrameNavigationStartEvents() {
        if (!this.traceEngineData) {
            return [];
        }
        return this.traceEngineData.Meta.mainFrameNavigations;
    }
    entryTitle(entryIndex) {
        const entryType = this.entryType(entryIndex);
        if (entryType === "Event" /* EntryType.Event */) {
            const event = this.entryData[entryIndex];
            if (event.phase === "T" /* TraceEngine.Types.TraceEvents.Phase.ASYNC_STEP_INTO */ ||
                event.phase === "p" /* TraceEngine.Types.TraceEvents.Phase.ASYNC_STEP_PAST */) {
                return event.name + ':' + event.args['step'];
            }
            if (this.#eventToDisallowRoot.get(event)) {
                return i18nString(UIStrings.onIgnoreList);
            }
            return TimelineUIUtils.eventTitle(event);
        }
        if (entryType === "Screenshot" /* EntryType.Screenshot */) {
            return '';
        }
        if (entryType === "TrackAppender" /* EntryType.TrackAppender */) {
            const timelineData = this.timelineDataInternal;
            const eventLevel = timelineData.entryLevels[entryIndex];
            const event = this.entryData[entryIndex];
            return this.compatibilityTracksAppender?.titleForEvent(event, eventLevel) || null;
        }
        let title = this.entryIndexToTitle[entryIndex];
        if (!title) {
            title = `Unexpected entryIndex ${entryIndex}`;
            console.error(title);
        }
        return title;
    }
    textColor(index) {
        const event = this.entryData[index];
        if (!TimelineFlameChartDataProvider.isEntryRegularEvent(event)) {
            return FlameChartStyle.textColor;
        }
        return this.isIgnoreListedEvent(event) ? '#888' : FlameChartStyle.textColor;
    }
    entryFont(_index) {
        return this.#font;
    }
    // resetCompatibilityTracksAppender boolean set to false does not recreate the thread appenders
    reset(resetCompatibilityTracksAppender = true) {
        this.currentLevel = 0;
        this.entryData = [];
        this.entryParent = [];
        this.entryTypeByLevel = [];
        this.entryIndexToTitle = [];
        this.asyncColorByCategory = new Map();
        this.screenshotImageCache = new Map();
        this.#eventIndexByEvent = new Map();
        this.#eventToDisallowRoot = new WeakMap();
        if (resetCompatibilityTracksAppender) {
            this.compatibilityTracksAppender = null;
            this.timelineDataInternal = null;
        }
        else if (!resetCompatibilityTracksAppender && this.timelineDataInternal) {
            this.compatibilityTracksAppender?.setFlameChartDataAndEntryData(this.timelineDataInternal, this.entryData, this.entryTypeByLevel);
            this.compatibilityTracksAppender?.threadAppenders().forEach(threadAppender => threadAppender.setHeaderAppended(false));
        }
    }
    maxStackDepth() {
        return this.currentLevel;
    }
    /**
     * Builds the flame chart data using the tracks appender (which use
     * the new trace engine) and the legacy code paths present in this
     * file. The result built data is cached and returned.
     */
    timelineData(rebuild = false) {
        if (this.timelineDataInternal && this.timelineDataInternal.entryLevels.length !== 0 && !rebuild) {
            // The flame chart data is built already, so return the cached
            // data.
            return this.timelineDataInternal;
        }
        this.timelineDataInternal = PerfUI.FlameChart.FlameChartTimelineData.createEmpty();
        if (!this.legacyTimelineModel) {
            return this.timelineDataInternal;
        }
        if (rebuild) {
            this.reset(/* resetCompatibilityTracksAppender= */ false);
        }
        this.currentLevel = 0;
        if (this.traceEngineData) {
            this.compatibilityTracksAppender = this.compatibilityTracksAppenderInstance();
            if (this.traceEngineData.Meta.traceIsGeneric) {
                this.#processGenericTrace();
            }
            else {
                this.processInspectorTrace();
            }
        }
        return this.timelineDataInternal;
    }
    #processGenericTrace() {
        if (!this.compatibilityTracksAppender) {
            return;
        }
        const appendersByProcess = this.compatibilityTracksAppender.allThreadAppendersByProcess();
        for (const [pid, threadAppenders] of appendersByProcess) {
            const processGroupStyle = this.buildGroupStyle({ shareHeaderLine: false });
            const processName = this.traceEngineData?.Meta.processNames.get(pid)?.args.name || 'Process';
            this.appendHeader(`${processName} (${pid})`, processGroupStyle, true, false);
            for (const appender of threadAppenders) {
                appender.setHeaderNestingLevel(1);
                this.currentLevel = appender.appendTrackAtLevel(this.currentLevel);
            }
        }
    }
    processInspectorTrace() {
        if (!this.isCpuProfile) {
            this.appendFrames();
        }
        const weight = (track) => {
            if (track.appenderName !== undefined) {
                switch (track.appenderName) {
                    case 'Animations':
                        return 0;
                    case 'Timings':
                        return 1;
                    case 'Interactions':
                        return 2;
                    case 'LayoutShifts':
                        return 3;
                    case 'GPU':
                        return 8;
                    case 'Thread':
                        return 4;
                    case 'Thread_AuctionWorklet':
                        return 10;
                    default:
                        return -1;
                }
            }
            switch (track.type) {
                case TimelineModel.TimelineModel.TrackType.MainThread:
                    return track.forMainFrame ? 5 : 6;
                case TimelineModel.TimelineModel.TrackType.Worker:
                    return 7;
                case TimelineModel.TimelineModel.TrackType.Raster:
                    return 9;
                case TimelineModel.TimelineModel.TrackType.Other:
                    return 11;
                default:
                    return -1;
            }
        };
        if (!this.legacyTimelineModel) {
            return;
        }
        const allTrackAppenders = this.compatibilityTracksAppender ? this.compatibilityTracksAppender.allVisibleTrackAppenders() : [];
        allTrackAppenders.sort((a, b) => weight(a) - weight(b));
        for (const appender of allTrackAppenders) {
            if (!this.traceEngineData) {
                continue;
            }
            this.currentLevel = appender.appendTrackAtLevel(this.currentLevel);
            // If there is not a selected group, we want to default to selecting the
            // main thread track. Therefore in this check we look to see if the
            // current appender is a ThreadAppender and represnets the Main Thread.
            // If it is, we mark the group as selected.
            if (this.timelineDataInternal && !this.timelineDataInternal.selectedGroup) {
                if (appender instanceof ThreadAppender &&
                    (appender.threadType === "MAIN_THREAD" /* TraceEngine.Handlers.Threads.ThreadType.MAIN_THREAD */ ||
                        appender.threadType === "CPU_PROFILE" /* TraceEngine.Handlers.Threads.ThreadType.CPU_PROFILE */)) {
                    const group = this.compatibilityTracksAppender?.groupForAppender(appender);
                    if (group) {
                        this.timelineDataInternal.selectedGroup = group;
                    }
                }
            }
        }
        if (this.timelineDataInternal && this.timelineDataInternal.selectedGroup) {
            this.timelineDataInternal.selectedGroup.expanded = true;
        }
    }
    #addDecorationToEvent(eventIndex, decoration) {
        if (!this.timelineDataInternal) {
            return;
        }
        const decorationsForEvent = this.timelineDataInternal.entryDecorations[eventIndex] || [];
        decorationsForEvent.push(decoration);
        this.timelineDataInternal.entryDecorations[eventIndex] = decorationsForEvent;
    }
    /**
     * Appends a track in the flame chart using the legacy system.
     * @param track the legacy track to be rendered.
     * @param expanded if the track is expanded.
     */
    appendLegacyTrackData(track, expanded) {
        this.#instantiateTimelineData();
        const eventEntryType = "Event" /* EntryType.Event */;
        switch (track.type) {
            case TimelineModel.TimelineModel.TrackType.MainThread: {
                if (track.forMainFrame) {
                    const group = this.appendSyncEvents(track, track.events, track.url ? i18nString(UIStrings.mainS, { PH1: track.url }) : i18nString(UIStrings.main), this.headerLevel1, eventEntryType, true /* selectable */, expanded);
                    if (group && this.timelineDataInternal) {
                        this.timelineDataInternal.selectedGroup = group;
                    }
                }
                else {
                    this.appendSyncEvents(track, track.events, track.url ? i18nString(UIStrings.frameS, { PH1: track.url }) : i18nString(UIStrings.subframe), this.headerLevel1, eventEntryType, true /* selectable */, expanded);
                }
                break;
            }
            case TimelineModel.TimelineModel.TrackType.Worker: {
                this.appendSyncEvents(track, track.events, track.name, this.headerLevel1, eventEntryType, true /* selectable */, expanded);
                break;
            }
            case TimelineModel.TimelineModel.TrackType.Raster: {
                if (!this.#rasterCount) {
                    this.appendHeader(i18nString(UIStrings.raster), this.headerLevel1, false /* selectable */, expanded);
                }
                ++this.#rasterCount;
                this.appendSyncEvents(track, track.events, i18nString(UIStrings.rasterizerThreadS, { PH1: this.#rasterCount }), this.headerLevel2, eventEntryType, true /* selectable */, expanded);
                break;
            }
            case TimelineModel.TimelineModel.TrackType.Other: {
                this.appendSyncEvents(track, track.events, track.name || i18nString(UIStrings.thread), this.headerLevel1, eventEntryType, true /* selectable */, expanded);
                this.appendAsyncEventsGroup(track, track.name, track.asyncEvents, this.headerLevel1, eventEntryType, true /* selectable */, expanded);
                break;
            }
        }
    }
    minimumBoundary() {
        return this.minimumBoundaryInternal;
    }
    totalTime() {
        return this.timeSpan;
    }
    /**
     * Narrows an entry of type TimelineFlameChartEntry to the 2 types of
     * simple trace events (legacy and new engine definitions).
     */
    static isEntryRegularEvent(entry) {
        return 'name' in entry;
    }
    search(startTime, endTime, filter) {
        const result = [];
        this.timelineData();
        for (let i = 0; i < this.entryData.length; ++i) {
            const entry = this.entryData[i];
            if (!TimelineFlameChartDataProvider.isEntryRegularEvent(entry)) {
                continue;
            }
            if (!entry) {
                continue;
            }
            // Until all the tracks are powered by the new engine, we need to
            // consider that these entries could be either new engine or legacy
            // engine.
            const entryStartTime = TraceEngine.Legacy.eventIsFromNewEngine(entry) ?
                TraceEngine.Helpers.Timing.eventTimingsMilliSeconds(entry).startTime :
                entry.startTime;
            const entryEndTime = TraceEngine.Legacy.eventIsFromNewEngine(entry) ?
                TraceEngine.Helpers.Timing.eventTimingsMilliSeconds(entry).endTime :
                entry.endTime;
            if (entryStartTime > endTime) {
                continue;
            }
            if ((entryEndTime || entryStartTime) < startTime) {
                continue;
            }
            if (filter.accept(entry, this.traceEngineData || undefined)) {
                result.push(i);
            }
        }
        result.sort((a, b) => {
            let firstEvent = this.entryData[a];
            let secondEvent = this.entryData[b];
            if (!TimelineFlameChartDataProvider.isEntryRegularEvent(firstEvent) ||
                !TimelineFlameChartDataProvider.isEntryRegularEvent(secondEvent)) {
                return 0;
            }
            firstEvent = firstEvent instanceof TraceEngine.Legacy.Event ?
                firstEvent :
                (this.compatibilityTracksAppender?.getLegacyEvent(firstEvent) || null);
            secondEvent = secondEvent instanceof TraceEngine.Legacy.Event ?
                secondEvent :
                (this.compatibilityTracksAppender?.getLegacyEvent(secondEvent) || null);
            if (!firstEvent || !secondEvent) {
                return 0;
            }
            return TraceEngine.Legacy.Event.compareStartTime(firstEvent, secondEvent);
        });
        return result;
    }
    appendSyncEvents(track, events, title, style, entryType, selectable, expanded) {
        if (!events.length) {
            return null;
        }
        if (!this.legacyPerformanceModel || !this.legacyTimelineModel) {
            return null;
        }
        const openEvents = [];
        const ignoreListingEnabled = Root.Runtime.experiments.isEnabled('ignore-list-js-frames-on-timeline');
        let maxStackDepth = 0;
        let group = null;
        if (track && track.type === TimelineModel.TimelineModel.TrackType.MainThread) {
            group = this.appendHeader(title, style, selectable, expanded);
            group.track = track;
        }
        for (let i = 0; i < events.length; ++i) {
            const event = events[i];
            const { duration: eventDuration } = TraceEngine.Legacy.timesForEventInMilliseconds(event);
            // TODO(crbug.com/1386091) this check should happen at the model level.
            // Skip Layout Shifts and TTI events when dealing with the main thread.
            if (this.legacyPerformanceModel) {
                const isInteractiveTime = this.legacyPerformanceModel.timelineModel().isInteractiveTimeEvent(event);
                const isLayoutShift = this.legacyPerformanceModel.timelineModel().isLayoutShiftEvent(event);
                const skippableEvent = isInteractiveTime || isLayoutShift;
                if (track && track.type === TimelineModel.TimelineModel.TrackType.MainThread && skippableEvent) {
                    continue;
                }
            }
            if (!TraceEngine.Types.TraceEvents.isFlowPhase(event.phase)) {
                if (!event.endTime && event.phase !== "I" /* TraceEngine.Types.TraceEvents.Phase.INSTANT */) {
                    continue;
                }
                if (TraceEngine.Types.TraceEvents.isAsyncPhase(event.phase)) {
                    continue;
                }
                if (!ActiveFilters.instance().isVisible(event)) {
                    continue;
                }
            }
            // Handle events belonging to a stack. E.g. A call stack in the main thread flame chart.
            while (openEvents.length &&
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                // @ts-expect-error
                (openEvents[openEvents.length - 1].endTime) <= event.startTime) {
                openEvents.pop();
            }
            this.#eventToDisallowRoot.set(event, false);
            if (ignoreListingEnabled && this.isIgnoreListedEvent(event)) {
                const parent = openEvents[openEvents.length - 1];
                if (parent && this.#eventToDisallowRoot.get(parent)) {
                    continue;
                }
                this.#eventToDisallowRoot.set(event, true);
            }
            if (!group && title) {
                group = this.appendHeader(title, style, selectable, expanded);
                if (selectable) {
                    group.track = track;
                }
            }
            const level = this.currentLevel + openEvents.length;
            const index = this.appendEvent(event, level);
            if (openEvents.length) {
                this.entryParent[index] = openEvents[openEvents.length - 1];
            }
            const trackIsMainThreadMainFrame = Boolean(track?.forMainFrame && track?.type === TimelineModel.TimelineModel.TrackType.MainThread);
            // If we are dealing with the Main Thread, find any long tasks and add
            // the candy striping to them. Doing it here avoids having to do another
            // pass through the events at a later point.
            if (trackIsMainThreadMainFrame && event.name === TimelineModel.TimelineModel.RecordType.Task &&
                TraceEngine.Helpers.Timing.millisecondsToMicroseconds(eventDuration) >
                    TraceEngine.Handlers.ModelHandlers.Warnings.LONG_MAIN_THREAD_TASK_THRESHOLD) {
                this.#addDecorationToEvent(index, {
                    type: "CANDY" /* PerfUI.FlameChart.FlameChartDecorationType.CANDY */,
                    startAtTime: TraceEngine.Handlers.ModelHandlers.Warnings.LONG_MAIN_THREAD_TASK_THRESHOLD,
                });
            }
            maxStackDepth = Math.max(maxStackDepth, openEvents.length + 1);
            if (event.endTime) {
                openEvents.push(event);
            }
        }
        this.entryTypeByLevel.length = this.currentLevel + maxStackDepth;
        this.entryTypeByLevel.fill(entryType, this.currentLevel);
        this.currentLevel += maxStackDepth;
        return group;
    }
    isIgnoreListedEvent(event) {
        if (TraceEngine.Legacy.eventIsFromNewEngine(event) && TraceEngine.Types.TraceEvents.isProfileCall(event)) {
            return this.isIgnoreListedURL(event.callFrame.url);
        }
        return false;
    }
    isIgnoreListedURL(url) {
        return Bindings.IgnoreListManager.IgnoreListManager.instance().isUserIgnoreListedURL(url);
    }
    appendAsyncEventsGroup(track, title, events, style, entryType, selectable, expanded) {
        if (!events.length) {
            return null;
        }
        const lastUsedTimeByLevel = [];
        let group = null;
        for (let i = 0; i < events.length; ++i) {
            const asyncEvent = events[i];
            if (!this.legacyPerformanceModel || !ActiveFilters.instance().isVisible(asyncEvent)) {
                continue;
            }
            if (!group && title) {
                group = this.appendHeader(title, style, selectable, expanded);
                if (selectable) {
                    group.track = track;
                }
            }
            const startTime = asyncEvent.startTime;
            let level;
            for (level = 0; level < lastUsedTimeByLevel.length && lastUsedTimeByLevel[level] > startTime; ++level) {
            }
            this.appendAsyncEvent(asyncEvent, this.currentLevel + level);
            lastUsedTimeByLevel[level] = asyncEvent.endTime;
        }
        this.entryTypeByLevel.length = this.currentLevel + lastUsedTimeByLevel.length;
        this.entryTypeByLevel.fill(entryType, this.currentLevel);
        this.currentLevel += lastUsedTimeByLevel.length;
        return group;
    }
    getEntryTypeForLevel(level) {
        return this.entryTypeByLevel[level];
    }
    appendFrames() {
        if (!this.legacyPerformanceModel || !this.timelineDataInternal || !this.legacyTimelineModel ||
            !this.traceEngineData) {
            return;
        }
        // TODO: Long term we want to move both the Frames track and the screenshots
        // track into the TrackAppender system. However right now the frames track
        // expects data in a different form to how the new engine parses frame
        // information. Therefore we have migrated the screenshots to use the new
        // data model in place without creating a new TrackAppender. When we can
        // migrate the frames track to the new appender system, we can migrate the
        // screnshots then as well.
        const filmStrip = TraceEngine.Extras.FilmStrip.fromTraceData(this.traceEngineData);
        const hasScreenshots = filmStrip.frames.length > 0;
        this.framesHeader.collapsible = hasScreenshots;
        const expanded = Root.Runtime.Runtime.queryParam('flamechart-force-expand') === 'frames';
        this.appendHeader(i18nString(UIStrings.frames), this.framesHeader, false /* selectable */, expanded);
        this.entryTypeByLevel[this.currentLevel] = "Frame" /* EntryType.Frame */;
        for (const frame of this.traceEngineData.Frames.frames) {
            this.#appendNewEngineFrame(frame);
        }
        ++this.currentLevel;
        if (!hasScreenshots) {
            return;
        }
        this.#appendScreenshots(filmStrip);
    }
    #appendScreenshots(filmStrip) {
        if (!this.timelineDataInternal || !this.legacyTimelineModel) {
            return;
        }
        this.appendHeader('', this.screenshotsHeader, false /* selectable */);
        this.entryTypeByLevel[this.currentLevel] = "Screenshot" /* EntryType.Screenshot */;
        let prevTimestamp = undefined;
        for (const filmStripFrame of filmStrip.frames) {
            const screenshotTimeInMilliSeconds = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(filmStripFrame.screenshotEvent.ts);
            this.entryData.push(filmStripFrame.screenshotEvent);
            this.timelineDataInternal.entryLevels.push(this.currentLevel);
            this.timelineDataInternal.entryStartTimes.push(screenshotTimeInMilliSeconds);
            if (prevTimestamp) {
                this.timelineDataInternal.entryTotalTimes.push(screenshotTimeInMilliSeconds - prevTimestamp);
            }
            prevTimestamp = screenshotTimeInMilliSeconds;
        }
        if (filmStrip.frames.length && prevTimestamp !== undefined) {
            // Set the total time of the final screenshot so it takes up the remainder of the trace.
            this.timelineDataInternal.entryTotalTimes
                .push(this.legacyTimelineModel.maximumRecordTime() - prevTimestamp);
        }
        ++this.currentLevel;
    }
    entryType(entryIndex) {
        return this.entryTypeByLevel[this.timelineDataInternal
            .entryLevels[entryIndex]];
    }
    prepareHighlightedEntryInfo(entryIndex) {
        let time = '';
        let title;
        let warningElements = [];
        let nameSpanTimelineInfoTime = 'timeline-info-time';
        const additionalContent = [];
        const entryType = this.entryType(entryIndex);
        if (entryType === "TrackAppender" /* EntryType.TrackAppender */) {
            if (!this.compatibilityTracksAppender) {
                return null;
            }
            const event = this.entryData[entryIndex];
            const timelineData = this.timelineDataInternal;
            const eventLevel = timelineData.entryLevels[entryIndex];
            const highlightedEntryInfo = this.compatibilityTracksAppender.highlightedEntryInfo(event, eventLevel);
            title = highlightedEntryInfo.title;
            time = highlightedEntryInfo.formattedTime;
            warningElements = highlightedEntryInfo.warningElements || warningElements;
            if (TraceEngine.Types.TraceEvents.isSyntheticInteractionEvent(event)) {
                const breakdown = new Components.InteractionBreakdown.InteractionBreakdown();
                breakdown.entry = event;
                additionalContent.push(breakdown);
            }
        }
        else if (entryType === "Event" /* EntryType.Event */) {
            const event = this.entryData[entryIndex];
            const totalTime = event.duration;
            const selfTime = event.selfTime;
            const eps = 1e-6;
            if (typeof totalTime === 'number') {
                time = Math.abs(totalTime - selfTime) > eps && selfTime > eps ?
                    i18nString(UIStrings.sSelfS, {
                        PH1: i18n.TimeUtilities.millisToString(totalTime, true),
                        PH2: i18n.TimeUtilities.millisToString(selfTime, true),
                    }) :
                    i18n.TimeUtilities.millisToString(totalTime, true);
            }
            title = this.entryTitle(entryIndex);
        }
        else if (entryType === "Frame" /* EntryType.Frame */) {
            const frame = this.entryData[entryIndex];
            time = i18n.TimeUtilities.preciseMillisToString(TraceEngine.Helpers.Timing.microSecondsToMilliseconds(frame.duration), 1);
            if (frame.idle) {
                title = i18nString(UIStrings.idleFrame);
            }
            else if (frame.dropped) {
                if (frame.isPartial) {
                    title = i18nString(UIStrings.partiallyPresentedFrame);
                }
                else {
                    title = i18nString(UIStrings.droppedFrame);
                }
                nameSpanTimelineInfoTime = 'timeline-info-warning';
            }
            else {
                title = i18nString(UIStrings.frame);
            }
        }
        else {
            return null;
        }
        const element = document.createElement('div');
        const root = UI.Utils.createShadowRootWithCoreStyles(element, {
            cssFile: [timelineFlamechartPopoverStyles],
            delegatesFocus: undefined,
        });
        const contents = root.createChild('div', 'timeline-flamechart-popover');
        contents.createChild('span', nameSpanTimelineInfoTime).textContent = time;
        contents.createChild('span', 'timeline-info-title').textContent = title;
        if (warningElements) {
            for (const warningElement of warningElements) {
                warningElement.classList.add('timeline-info-warning');
                contents.appendChild(warningElement);
            }
        }
        for (const elem of additionalContent) {
            contents.appendChild(elem);
        }
        return element;
    }
    prepareHighlightedHiddenEntriesArrowInfo(group, entryIndex) {
        const element = document.createElement('div');
        const root = UI.Utils.createShadowRootWithCoreStyles(element, {
            cssFile: [timelineFlamechartPopoverStyles],
            delegatesFocus: undefined,
        });
        const entry = this.entryData[entryIndex];
        const hiddenEntriesAmount = this.compatibilityTracksAppender?.findHiddenDescendantsAmount(group, entry);
        if (!hiddenEntriesAmount) {
            return null;
        }
        const contents = root.createChild('div', 'timeline-flamechart-popover');
        contents.createChild('span', 'timeline-info-title').textContent = hiddenEntriesAmount + ' hidden';
        return element;
    }
    entryColor(entryIndex) {
        function patchColorAndCache(cache, key, lookupColor) {
            let color = cache.get(key);
            if (color) {
                return color;
            }
            const parsedColor = lookupColor(key);
            if (!parsedColor) {
                throw new Error('Could not parse color from entry');
            }
            color = parsedColor;
            cache.set(key, color);
            return (color);
        }
        if (!this.legacyPerformanceModel || !this.legacyTimelineModel) {
            return '';
        }
        const entryType = this.entryType(entryIndex);
        if (entryType === "Event" /* EntryType.Event */) {
            const event = this.entryData[entryIndex];
            if (this.legacyTimelineModel.isGenericTrace()) {
                return this.genericTraceEventColor(event);
            }
            if (this.legacyPerformanceModel.timelineModel().isMarkerEvent(event)) {
                return TimelineUIUtils.markerStyleForEvent(event).color;
            }
            if (!TraceEngine.Types.TraceEvents.isAsyncPhase(event.phase) && this.colorForEvent) {
                return this.colorForEvent(event);
            }
            const category = TimelineUIUtils.eventStyle(event).category;
            return patchColorAndCache(this.asyncColorByCategory, category, () => category.getComputedColorValue());
        }
        if (entryType === "Frame" /* EntryType.Frame */) {
            return 'white';
        }
        if (entryType === "TrackAppender" /* EntryType.TrackAppender */) {
            const timelineData = this.timelineDataInternal;
            const eventLevel = timelineData.entryLevels[entryIndex];
            const event = this.entryData[entryIndex];
            return this.compatibilityTracksAppender?.colorForEvent(event, eventLevel) || '';
        }
        return '';
    }
    genericTraceEventColor(event) {
        const key = event.categoriesString || event.name;
        return key ? `hsl(${Platform.StringUtilities.hashCode(key) % 300 + 30}, 40%, 70%)` : '#ccc';
    }
    preparePatternCanvas() {
        // Set the candy stripe pattern to 17px so it repeats well.
        const size = 17;
        this.droppedFramePatternCanvas.width = size;
        this.droppedFramePatternCanvas.height = size;
        this.partialFramePatternCanvas.width = size;
        this.partialFramePatternCanvas.height = size;
        const ctx = this.droppedFramePatternCanvas.getContext('2d');
        if (ctx) {
            // Make a dense solid-line pattern.
            ctx.translate(size * 0.5, size * 0.5);
            ctx.rotate(Math.PI * 0.25);
            ctx.translate(-size * 0.5, -size * 0.5);
            ctx.fillStyle = 'rgb(255, 255, 255)';
            for (let x = -size; x < size * 2; x += 3) {
                ctx.fillRect(x, -size, 1, size * 3);
            }
        }
        const ctx2 = this.partialFramePatternCanvas.getContext('2d');
        if (ctx2) {
            // Make a sparse dashed-line pattern.
            ctx2.strokeStyle = 'rgb(255, 255, 255)';
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.moveTo(17, 0);
            ctx2.lineTo(10, 7);
            ctx2.moveTo(8, 9);
            ctx2.lineTo(2, 15);
            ctx2.stroke();
        }
    }
    drawFrame(entryIndex, context, text, barX, barY, barWidth, barHeight) {
        const hPadding = 1;
        const frame = this.entryData[entryIndex];
        barX += hPadding;
        barWidth -= 2 * hPadding;
        if (frame.idle) {
            context.fillStyle = 'white';
        }
        else if (frame.dropped) {
            if (frame.isPartial) {
                // For partially presented frame boxes, paint a yellow background with
                // a sparse white dashed-line pattern overlay.
                context.fillStyle = '#f0e442';
                context.fillRect(barX, barY, barWidth, barHeight);
                const overlay = context.createPattern(this.partialFramePatternCanvas, 'repeat');
                context.fillStyle = overlay || context.fillStyle;
            }
            else {
                // For dropped frame boxes, paint a red background with a dense white
                // solid-line pattern overlay.
                context.fillStyle = '#f08080';
                context.fillRect(barX, barY, barWidth, barHeight);
                const overlay = context.createPattern(this.droppedFramePatternCanvas, 'repeat');
                context.fillStyle = overlay || context.fillStyle;
            }
        }
        else {
            context.fillStyle = '#d7f0d1';
        }
        context.fillRect(barX, barY, barWidth, barHeight);
        const frameDurationText = i18n.TimeUtilities.preciseMillisToString(TraceEngine.Helpers.Timing.microSecondsToMilliseconds(frame.duration), 1);
        const textWidth = context.measureText(frameDurationText).width;
        if (textWidth <= barWidth) {
            context.fillStyle = this.textColor(entryIndex);
            context.fillText(frameDurationText, barX + (barWidth - textWidth) / 2, barY + barHeight - 4);
        }
    }
    async drawScreenshot(entryIndex, context, barX, barY, barWidth, barHeight) {
        const screenshot = this.entryData[entryIndex];
        if (!this.screenshotImageCache.has(screenshot)) {
            this.screenshotImageCache.set(screenshot, null);
            const data = screenshot.args.dataUri;
            const image = await UI.UIUtils.loadImage(data);
            this.screenshotImageCache.set(screenshot, image);
            this.dispatchEventToListeners("DataChanged" /* Events.DataChanged */);
            return;
        }
        const image = this.screenshotImageCache.get(screenshot);
        if (!image) {
            return;
        }
        const imageX = barX + 1;
        const imageY = barY + 1;
        const imageHeight = barHeight - 2;
        const scale = imageHeight / image.naturalHeight;
        const imageWidth = Math.floor(image.naturalWidth * scale);
        context.save();
        context.beginPath();
        context.rect(barX, barY, barWidth, barHeight);
        context.clip();
        context.drawImage(image, imageX, imageY, imageWidth, imageHeight);
        context.strokeStyle = '#ccc';
        context.strokeRect(imageX - 0.5, imageY - 0.5, Math.min(barWidth - 1, imageWidth + 1), imageHeight);
        context.restore();
    }
    decorateEntry(entryIndex, context, text, barX, barY, barWidth, barHeight, unclippedBarX, timeToPixelRatio) {
        const entryType = this.entryType(entryIndex);
        if (entryType === "Frame" /* EntryType.Frame */) {
            this.drawFrame(entryIndex, context, text, barX, barY, barWidth, barHeight);
            return true;
        }
        if (entryType === "Screenshot" /* EntryType.Screenshot */) {
            void this.drawScreenshot(entryIndex, context, barX, barY, barWidth, barHeight);
            return true;
        }
        if (entryType === "TrackAppender" /* EntryType.TrackAppender */) {
            const entry = this.entryData[entryIndex];
            if (TraceEngine.Types.TraceEvents.isSyntheticInteractionEvent(entry)) {
                this.#drawInteractionEventWithWhiskers(context, entryIndex, text, entry, barX, barY, unclippedBarX, barWidth, barHeight, timeToPixelRatio);
                return true;
            }
        }
        return false;
    }
    /**
     * Draws the left and right whiskers around an interaction in the timeline.
     * @param context - the canvas that will be drawn onto
     * @param entryIndex
     * @param entryTitle - the title of the entry
     * @param entry - the entry itself
     * @param barX - the starting X pixel position of the bar representing this event. This is clipped: if the bar is off the left side of the screen, this value will be 0
     * @param barY - the starting Y pixel position of the bar representing this event.
     * @param unclippedBarXStartPixel - the starting X pixel position of the bar representing this event, not clipped. This means if the bar is off the left of the screen this will be a negative number.
     * @param barWidth - the width of the full bar in pixels
     * @param barHeight - the height of the full bar in pixels
     * @param timeToPixelRatio - the ratio required to convert a millisecond time to a pixel value.
     **/
    #drawInteractionEventWithWhiskers(context, entryIndex, entryTitle, entry, barX, barY, unclippedBarXStartPixel, barWidth, barHeight, timeToPixelRatio) {
        /**
         * An interaction is drawn with whiskers as so:
         * |----------[=======]-------------|
         * => The left whisker is the event's start time (event.ts)
         * => The box start is the event's processingStart time
         * => The box end is the event's processingEnd time
         * => The right whisker is the event's end time (event.ts + event.dur)
         *
         * When we draw the event in the InteractionsAppender, we draw a huge box
         * that spans the entire of the above. So here we need to draw over the
         * rectangle that is outside of {processingStart, processingEnd} and
         * replace it with the whiskers.
         * TODO(crbug.com/1495248): rework how we draw whiskers to avoid this inefficiency
         */
        const beginTime = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(entry.ts);
        const entireBarEndXPixel = barX + barWidth;
        function timeToPixel(time) {
            const timeMilli = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(time);
            return Math.floor(unclippedBarXStartPixel + (timeMilli - beginTime) * timeToPixelRatio);
        }
        context.save();
        // Clear portions of initial rect to prepare for the ticks.
        context.fillStyle = ThemeSupport.ThemeSupport.instance().getComputedValue('--sys-color-cdt-base-container');
        let desiredBoxStartX = timeToPixel(entry.processingStart);
        const desiredBoxEndX = timeToPixel(entry.processingEnd);
        // If the entry has no processing time, ensure the box is 1px wide so at least it is visible.
        if (entry.processingEnd - entry.processingStart === 0) {
            desiredBoxStartX -= 1;
        }
        context.fillRect(barX, barY - 0.5, desiredBoxStartX - barX, barHeight);
        context.fillRect(desiredBoxEndX, barY - 0.5, entireBarEndXPixel - desiredBoxEndX, barHeight);
        // Draws left and right whiskers
        function drawTick(begin, end, y) {
            const tickHeightPx = 6;
            context.moveTo(begin, y - tickHeightPx / 2);
            context.lineTo(begin, y + tickHeightPx / 2);
            context.moveTo(begin, y);
            context.lineTo(end, y);
        }
        // The left whisker starts at the enty timestamp, and continues until the start of the box (processingStart).
        const leftWhiskerX = timeToPixel(entry.ts);
        // The right whisker ends at (entry.ts + entry.dur). We draw the line from the end of the box (processingEnd).
        const rightWhiskerX = timeToPixel(TraceEngine.Types.Timing.MicroSeconds(entry.ts + entry.dur));
        context.beginPath();
        context.lineWidth = 1;
        context.strokeStyle = '#ccc';
        const lineY = Math.floor(barY + barHeight / 2) + 0.5;
        const leftTick = leftWhiskerX + 0.5;
        const rightTick = rightWhiskerX - 0.5;
        drawTick(leftTick, desiredBoxStartX, lineY);
        drawTick(rightTick, desiredBoxEndX, lineY);
        context.stroke();
        if (entryTitle) {
            // BarX will be set to 0 if the start of the box if off the screen to the
            // left. If this happens, the desiredBoxStartX will be negative. In that
            // case, we fallback to the BarX. This ensures that even if the box
            // starts off-screen, we draw the text at the first visible on screen
            // pixels, so the user can still see the event's title.
            const textStartX = desiredBoxStartX > 0 ? desiredBoxStartX : barX;
            context.font = this.#font;
            const textWidth = UI.UIUtils.measureTextWidth(context, entryTitle);
            // These numbers are duplicated from FlameChart.ts.
            const textPadding = 5;
            const textBaseline = 5;
            // Only draw the text if it can fit in the amount of box that is visible.
            if (textWidth <= desiredBoxEndX - textStartX + textPadding) {
                context.fillStyle = this.textColor(entryIndex);
                context.fillText(entryTitle, textStartX + textPadding, barY + barHeight - textBaseline);
            }
        }
        context.restore();
    }
    forceDecoration(entryIndex) {
        const entryType = this.entryType(entryIndex);
        if (entryType === "Frame" /* EntryType.Frame */) {
            return true;
        }
        if (entryType === "Screenshot" /* EntryType.Screenshot */) {
            return true;
        }
        if (entryType === "Event" /* EntryType.Event */) {
            // TODO: this entryType can no longer exist as all tracks are now
            // migrated to appenders. This can be removed as part of the old engine
            // removal.
            return false;
        }
        const event = this.entryData[entryIndex];
        if (TraceEngine.Types.TraceEvents.isSyntheticInteractionEvent(event)) {
            // We draw interactions with whiskers, which are done via the
            // decorateEntry() method, hence we always want to force these to be
            // decorated.
            return true;
        }
        return Boolean(this.traceEngineData?.Warnings.perEvent.get(event));
    }
    appendHeader(title, style, selectable, expanded) {
        const group = { startLevel: this.currentLevel, name: title, style: style, selectable: selectable, expanded };
        this.timelineDataInternal.groups.push(group);
        return group;
    }
    appendEvent(event, level) {
        const index = this.entryData.length;
        this.entryData.push(event);
        const timelineData = this.timelineDataInternal;
        timelineData.entryLevels[index] = level;
        timelineData.entryTotalTimes[index] = event.duration || InstantEventVisibleDurationMs;
        timelineData.entryStartTimes[index] = event.startTime;
        return index;
    }
    appendAsyncEvent(asyncEvent, level) {
        const steps = asyncEvent.steps;
        // If we have past steps, put the end event for each range rather than start one.
        const eventOffset = steps.length > 1 && steps[1].phase === "p" /* TraceEngine.Types.TraceEvents.Phase.ASYNC_STEP_PAST */ ? 1 : 0;
        for (let i = 0; i < steps.length - 1; ++i) {
            const index = this.entryData.length;
            this.entryData.push(steps[i + eventOffset]);
            const startTime = steps[i].startTime;
            const timelineData = this.timelineDataInternal;
            timelineData.entryLevels[index] = level;
            timelineData.entryTotalTimes[index] = steps[i + 1].startTime - startTime;
            timelineData.entryStartTimes[index] = startTime;
        }
    }
    #appendNewEngineFrame(frame) {
        const index = this.entryData.length;
        this.entryData.push(frame);
        const durationMilliseconds = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(frame.duration);
        this.entryIndexToTitle[index] = i18n.TimeUtilities.millisToString(durationMilliseconds, true);
        if (!this.timelineDataInternal) {
            return;
        }
        this.timelineDataInternal.entryLevels[index] = this.currentLevel;
        this.timelineDataInternal.entryTotalTimes[index] = durationMilliseconds;
        this.timelineDataInternal.entryStartTimes[index] =
            TraceEngine.Helpers.Timing.microSecondsToMilliseconds(frame.startTime);
    }
    createSelection(entryIndex) {
        const entryType = this.entryType(entryIndex);
        let timelineSelection = null;
        const entry = this.entryData[entryIndex];
        if (entry && TimelineFlameChartDataProvider.isEntryRegularEvent(entry)) {
            timelineSelection = TimelineSelection.fromTraceEvent(entry);
        }
        else if (entryType === "Frame" /* EntryType.Frame */) {
            timelineSelection = TimelineSelection.fromFrame(this.entryData[entryIndex]);
        }
        if (timelineSelection) {
            this.lastSelection = new Selection(timelineSelection, entryIndex);
        }
        return timelineSelection;
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.preciseMillisToString(value, precision);
    }
    canJumpToEntry(_entryIndex) {
        return false;
    }
    entryIndexForSelection(selection) {
        if (!selection || TimelineSelection.isRangeSelection(selection.object) ||
            TimelineSelection.isSyntheticNetworkRequestDetailsEventSelection(selection.object)) {
            return -1;
        }
        if (this.lastSelection && this.lastSelection.timelineSelection.object === selection.object) {
            return this.lastSelection.entryIndex;
        }
        // If the index is -1 and the selection is a TraceEvent, it might be
        // the case that this Entry is hidden by the Context Menu action.
        // Try revealing the entry and getting the index again.
        if (this.entryData.indexOf(selection.object) === -1 && TimelineSelection.isTraceEventSelection(selection.object)) {
            if (this.timelineDataInternal?.selectedGroup) {
                this.compatibilityTracksAppender?.revealEntry(this.timelineDataInternal?.selectedGroup, selection.object);
                this.timelineData(true);
            }
        }
        const index = this.entryData.indexOf(selection.object);
        if (index !== -1) {
            this.lastSelection = new Selection(selection, index);
        }
        return index;
    }
    getIndexForEvent(targetEvent) {
        // Gets the index for the given event by walking through the array of entryData.
        // This may seem inefficient - but we have seen that by building up large
        // maps keyed by trace events that this has a significant impact on the
        // performance of the panel.
        // Therefore, we strike a middle ground: look up the event the first time,
        // but then cache the result.
        const fromCache = this.#eventIndexByEvent.get(targetEvent);
        if (fromCache) {
            return fromCache;
        }
        const index = this.entryData.indexOf(targetEvent);
        const result = index > -1 ? index : null;
        this.#eventIndexByEvent.set(targetEvent, result);
        return result;
    }
    /**
     * Build the data for initiators and initiated entries.
     * @param entryIndex
     * @returns if we should re-render the flame chart (canvas)
     */
    buildFlowForInitiator(entryIndex) {
        if (this.lastInitiatorEntry === entryIndex) {
            return false;
        }
        if (!this.traceEngineData) {
            return false;
        }
        if (!this.timelineDataInternal) {
            return false;
        }
        if (!this.compatibilityTracksAppender) {
            return false;
        }
        // Remove all previously assigned decorations indicating that the flow event entries are hidden
        const previousInitiatorsDataLength = this.timelineDataInternal.initiatorsData.length;
        // |entryIndex| equals -1 means there is no entry selected, just clear the
        // initiator cache if there is any previous arrow and return true to
        // re-render.
        if (entryIndex === -1) {
            this.lastInitiatorEntry = entryIndex;
            if (previousInitiatorsDataLength === 0) {
                // This means there is no arrow before, so we don't need to re-render.
                return false;
            }
            // Reset to clear any previous arrows from the last event.
            this.timelineDataInternal.resetFlowData();
            return true;
        }
        const entryType = this.entryType(entryIndex);
        if (entryType !== "TrackAppender" /* EntryType.TrackAppender */) {
            return false;
        }
        const event = this.entryData[entryIndex];
        if (!TraceEngine.Legacy.eventIsFromNewEngine(event)) {
            // TODO: as part of the old engine removal, we need to redefine the Event
            // type to teach the code that only new engine events can be selected by
            // the user.
            return false;
        }
        // Reset to clear any previous arrows from the last event.
        this.timelineDataInternal.resetFlowData();
        this.lastInitiatorEntry = entryIndex;
        let hiddenEvents = [];
        let modifiedEntries = [];
        if (this.timelineDataInternal.selectedGroup) {
            hiddenEvents = this.compatibilityTracksAppender?.getHiddenEvents(this.timelineDataInternal.selectedGroup) ?? [];
            modifiedEntries =
                this.compatibilityTracksAppender?.getModifiedEntries(this.timelineDataInternal.selectedGroup) ?? [];
        }
        const initiatorsData = initiatorsDataToDraw(this.traceEngineData, event, hiddenEvents, modifiedEntries);
        // This means there is no change for arrows.
        if (previousInitiatorsDataLength === 0 && initiatorsData.length === 0) {
            return false;
        }
        for (const intiatorData of initiatorsData) {
            const eventIndex = this.getIndexForEvent(intiatorData.event);
            const initiatorIndex = this.getIndexForEvent(intiatorData.initiator);
            if (eventIndex === null || initiatorIndex === null) {
                continue;
            }
            this.timelineDataInternal.initiatorsData.push({
                initiatorIndex,
                eventIndex,
                isInitiatorHidden: intiatorData.isInitiatorHidden,
                isEntryHidden: intiatorData.isEntryHidden,
            });
        }
        return true;
    }
    eventByIndex(entryIndex) {
        if (entryIndex < 0) {
            return null;
        }
        const entryType = this.entryType(entryIndex);
        if (entryType === "TrackAppender" /* EntryType.TrackAppender */) {
            return this.entryData[entryIndex];
        }
        if (entryType === "Event" /* EntryType.Event */) {
            return this.entryData[entryIndex];
        }
        return null;
    }
    setEventColorMapping(colorForEvent) {
        this.colorForEvent = colorForEvent;
    }
    // Included only for layout tests.
    // TODO(crbug.com/1386091): Fix/port layout tests and remove.
    get performanceModel() {
        return this.legacyPerformanceModel;
    }
}
export const InstantEventVisibleDurationMs = 0.001;
//# sourceMappingURL=TimelineFlameChartDataProvider.js.map