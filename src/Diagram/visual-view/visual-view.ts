import * as d3 from 'd3';
import $ from 'jquery';
import _ from 'the-lodash';
import 'bootstrap/js/dist/tooltip';

import { VisualNode } from '../visual-node/visual-node';
import { ViewPosition } from '../types';
import { DiagramData } from '../types';
import { VisualNodeText } from '../visual-node/visual-node-text';
import { VisualNodeHeaderMarker } from '../visual-node/visual-node-header-marker';
import { VisualNodeHeaderFlag } from '../visual-node/visual-node-header-flag';
import { ISharedState } from '@kubevious/ui-framework';
import { getEntityImgUrl } from '@kubevious/ui-components';
import { VisualNodeHeaderExpander } from '../visual-node/visual-node-header-expander';
import {
    flagTooltip,
    nodeGroupTransform,
    nodeWidth,
    nodeHeight,
    nodeBgFillColor,
    nodeStrokeColor,
    nodeHeaderBgHeight,
    nodeHeaderBgFillColor,
    nodePerformSelect,
    nodePerformExpandCollapse,
    nodeHeaderBgWidth,
    nodeHeaderHlFillColor,
    nodeHeaderX,
    nodeHeaderY,
    nodeHeaderWidth,
    nodeHeaderHeight,
    nodeHeaderText,
    nodeHeaderTransform,
} from '../utils';
import { VisualNodeSeverity } from '../visual-node/visual-node-severity';

export class VisualView {
    private _parentElem: any; // Selection<BaseType, unknown, HTMLElement, any>
    private _width: number;
    private _height: number;
    private _viewPos: ViewPosition;
    private _showRoot: boolean = true;
    private _nodeDict: Record<string, VisualNode> = {};
    private _currentSelectedNodeDn: string | null = null;
    private _controlInfo: any; // ControlInfo
    private _flatVisualNodes: VisualNode[];
    private _existingNodeIds: Record<string, boolean> = {};
    private _markerData: Record<string, any>;
    private _d3NodeDict: Record<string, VisualNode>;
    private _d3SmallNodeDict: {};
    private _svgElem: any; // Selection<BaseType, unknown, HTMLElement, any>
    private _rootElem: any; // d3 element
    private _visualRoot: VisualNode | undefined;
    private _panInterpolator: any; // (t: number) => { x: number; y: number} - d3 function
    private _panAnimationDuration!: number | null;
    private _panInterpolatorStartTime!: Date | null;
    private _panAnimationTimer!: ReturnType<typeof setTimeout> | null;
    sharedState: ISharedState;

    constructor(parentElem: any, sharedState: ISharedState) {
        this._parentElem = parentElem;
        this.sharedState = sharedState;

        this._width = 0;
        this._height = 0;

        this._viewPos = { x: 0, y: 0 };

        this._controlInfo = {};

        this._flatVisualNodes = [];

        this._existingNodeIds = {};

        this._markerData = {};
        this._d3NodeDict = {};
        this._d3SmallNodeDict = {};

        sharedState.subscribe('selected_dn', (selected_dn: string) => {
            this._updateSelection(selected_dn);
        });

        sharedState.subscribe('markers_dict', (markers_dict: {}) => {
            this._markerData = markers_dict;
            if (!markers_dict) {
                this._markerData = {};
            }
            this.updateAll(true);
        });
    }

    get markerData(): Record<string, any> {
        return this._markerData;
    }

    get existingNodeIds(): {} {
        return this._existingNodeIds;
    }

    get currentSelectedNodeDn(): string | null {
        return this._currentSelectedNodeDn;
    }

    get d3NodeDict(): Record<string, VisualNode> {
        return this._d3NodeDict;
    }

    get d3SmallNodeDict(): {} {
        return this._d3SmallNodeDict;
    }

    getExpanded(dn: string): boolean {
        const dict = this.sharedState.get('diagram_expanded_dns');
        if (dict[dn]) {
            return true;
        }
        return false;
    }

    setExpanded(dn: string, value: {}) {
        const dict = this.sharedState.get('diagram_expanded_dns');
        dict[dn] = value;
        this.sharedState.set('diagram_expanded_dns', dict);
    }


    skipShowRoot(): void {
        this._showRoot = false;
    }

    setup(): void {
        this._svgElem = this._parentElem
            .append('svg')
            .attr('position', 'absolute')
            .attr('overflow', 'hidden')
            .attr('top', 0)
            .attr('left', 0)
            .attr('right', 0)
            .attr('bottom', 0);

        $(document).on('layout-resize-universeComponent', () => {
            this.setupDimentions();
        });

        this.setupDimentions();

        this._rootElem = this._svgElem.append('g');

        this._renderControl();

        this._setupPanning();
    }

    private _renderControl(): void {
        const self = this;
        this._controlInfo.previewGroupElem = this._svgElem.append('g').attr('class', 'preview');

        this._controlInfo.previewFullRectElem = this._controlInfo.previewGroupElem
            .append('rect')
            .attr('class', 'preview-full-rect');

        this._controlInfo.previewItemsGroupElem = this._controlInfo.previewGroupElem
            .append('g')
            .attr('class', 'preview-items-group');

        this._controlInfo.previewVisibleRectElem = this._controlInfo.previewGroupElem
            .append('rect')
            .attr('class', 'preview-visible-rect');

        this._controlInfo.previewGroupElem
            .on('click', () => {
                let pt = this._svgElem.node().createSVGPoint();
                // @ts-ignore: Unreachable code error
                pt.x = event.clientX;
                // @ts-ignore: Unreachable code error
                pt.y = event.clientY;
                const target = self._controlInfo.previewFullRectElem._groups[0][0];
                const cursorpt = pt.matrixTransform(target.getScreenCTM().inverse());

                this._userPanTo(
                    cursorpt.x / self._controlInfo.scale - this._width / 2,
                    cursorpt.y / self._controlInfo.scale - this._height / 2,
                );
            })
            .call(
                d3.drag().on('drag', (d) => {
                    this._userPanTo(
                        this._viewPos.x + d.dx / this._controlInfo.scale,
                        this._viewPos.y + d.dy / this._controlInfo.scale,
                        true,
                    );
                }),
            );
    }

    setupDimentions(size?: { width: number; height: number }): void {
        if (!size) {
            size = this._parentElem.node().getBoundingClientRect();
        }
        if (size) {
            this._width = size.width;
            this._height = size.height;

            this._setupControl();
            this._applyPanTransform();
        }
    }

    private _setupControl(): void {
        if (!this._visualRoot) {
            return;
        }

        const boxScale = 5;
        this._controlInfo.boxWidth = Math.max(100, this._width / boxScale);
        this._controlInfo.boxHeight = Math.max(100, this._height / boxScale);

        this._controlInfo.scale = Math.min(
            this._controlInfo.boxWidth / this._visualRoot.width,
            this._controlInfo.boxHeight / this._visualRoot.height,
        );

        this._controlInfo.boxWidth = Math.max(100, this._visualRoot.width * this._controlInfo.scale);
        this._controlInfo.boxHeight = Math.max(100, this._visualRoot.height * this._controlInfo.scale);

        this._controlInfo.x = this._width - this._controlInfo.boxWidth - 20;
        this._controlInfo.y = this._height - this._controlInfo.boxHeight - 20;

        if (this._controlInfo.previewGroupElem) {
            this._controlInfo.previewGroupElem.attr('transform', () => {
                return 'translate(' + this._controlInfo.x + ',' + this._controlInfo.y + ')';
            });
        } else {
            throw new Error('MISSING PREVIEW GROUP ELEM');
        }

        if (this._controlInfo.previewFullRectElem) {
            this._controlInfo.previewFullRectElem
                .attr('width', this._controlInfo.boxWidth) // this._visualRoot.width * this._controlInfo.scale)
                .attr('height', this._controlInfo.boxHeight); // this._visualRoot.height * this._controlInfo.scale);
        }

        if (this._controlInfo.previewItemsGroupElem) {
            this._controlInfo.previewItemsGroupElem.attr('transform', () => {
                return 'scale(' + this._controlInfo.scale + ', ' + this._controlInfo.scale + ')';
            });
        }

        if (this._controlInfo.previewVisibleRectElem) {
            this._controlInfo.previewVisibleRectElem
                .attr('x', this._viewPos.x * this._controlInfo.scale)
                .attr('y', this._viewPos.y * this._controlInfo.scale)
                .attr('width', this._width * this._controlInfo.scale)
                .attr('height', this._height * this._controlInfo.scale);
        }
    }

    private _setupPanning(): void {
        this._setupPanningByMouseDrag();

        this._setupPanningByWheel();

        this._applyPanTransform();
    }

    private _setupPanningByMouseDrag(): void {
        const drag = d3.drag().on('drag', (d) => {
            this._userPanTo(
                this._viewPos.x - d.dx,
                this._viewPos.y - d.dy,
                true,
            );
        });

        this._svgElem.call(drag);
    }

    private _setupPanningByWheel(): void {
        const doScroll = (e: WheelEvent) => {
            this._userPanTo(this._viewPos.x + e.deltaX, this._viewPos.y + e.deltaY, true);
            e.preventDefault();
        };

        const elem = document.getElementById('diagram');
        if (elem && elem.addEventListener) {
            elem.addEventListener('wheel', doScroll, false);
        }
    }

    private _activatePanning(): void {
        if (!this.sharedState.get('auto_pan_to_selected_dn')) {
            return;
        }

        const visualNode = this._nodeDict[this.sharedState.get('selected_dn')];
        if (!visualNode) {
            return;
        }

        this._panTo(
            visualNode.absX - Math.max(this._width / 2 - visualNode.width / 2, 10),
            visualNode.absY - Math.max(this._height / 2 - visualNode.height / 2, 10),
        );
    }

    private _userPanTo(x: number, y: number, skipAnimate?: boolean) {
        this.sharedState.set('auto_pan_to_selected_dn', false);
        this._panTo(x, y, skipAnimate);
    }

    private _panTo(x: number, y: number, skipAnimate?: boolean) {
        const targetViewPos = this._fixViewPos({ x: x, y: y });

        if (skipAnimate) {
            this._stopPanAnimation();
            this._viewPos = targetViewPos;
            this._applyPanTransform();
        } else {
            this._panInterpolator = d3.interpolate(this._viewPos, targetViewPos);

            this._panAnimationDuration = 200;
            this._panInterpolatorStartTime = new Date();
            this._animatePanTransform();
        }
    }

    private _animatePanTransform(): void {
        if (this._panAnimationTimer) {
            return;
        }

        this._panAnimationTimer = setTimeout(() => {
            this._panAnimationTimer = null;
            const date = new Date().getTime();
            const startDate: number = this._panInterpolatorStartTime
                ? new Date(this._panInterpolatorStartTime).getTime()
                : new Date().getTime();

            const diff = date - startDate;
            if (!this._panAnimationDuration) {
                return;
            }

            const t = diff / this._panAnimationDuration;
            this._viewPos = this._panInterpolator(t);
            this._applyPanTransform();

            if (t < 1.0) {
                this._animatePanTransform();
            } else {
                this._stopPanAnimation();
            }
        }, 10);
    }

    private _stopPanAnimation(): void {
        this._panInterpolator = null;
        this._panInterpolatorStartTime = null;
        this._panAnimationDuration = null;
        if (this._panAnimationTimer) {
            clearTimeout(this._panAnimationTimer);
            this._panAnimationTimer = null;
        }
    }

    private _applyPanTransform(): void {
        if (!this._rootElem) {
            return;
        }

        const pos = this._viewPos;
        // const pos = this._fixViewPos(this._viewPos);

        this._rootElem.attr('transform', () => {
            return 'translate(' + -pos.x + ',' + -pos.y + ')';
        });

        // const interpolator = d3.interpolate(
        //     [0, "0.5 mile", [12]],
        //     [10, "28 miles", [36]]
        //   );
        // console.log(interpolator(0.5));

        this._setupControl();
    }

    private _fixViewPos(pos: ViewPosition): ViewPosition {
        const newPos = { x: pos.x, y: pos.y };

        if (this._visualRoot) {
            newPos.x = Math.min(this._visualRoot.width - this._width, newPos.x);
            newPos.y = Math.min(this._visualRoot.height - this._height, newPos.y);
        }

        newPos.x = Math.max(0, newPos.x);
        newPos.y = Math.max(0, newPos.y);

        return newPos;
    }

    acceptSourceData(sourceData: DiagramData): void {
        this._nodeDict = {};
        this._visualRoot = this._packSourceData(sourceData);
        this._massageSourceData();
        this._setupControl();
    }

    private _packSourceData(root: DiagramData): VisualNode {
        const recurse = (node: DiagramData, parent: VisualNode | null): VisualNode => {
            const visualNode = new VisualNode(this, node, parent);
            if (!node.children) {
                node.children = [];
            }
            for (const child of node.children) {
                recurse(child, visualNode);
            }
            visualNode.prepare();
            this._nodeDict[visualNode.id] = visualNode;
            return visualNode;
        };

        return recurse(root, null);
    }

    private _massageSourceData(): void {
        if (!this._visualRoot) {
            return;
        }
        this._visualRoot.autoexpand();
        this._visualRoot.measureAndArrange();
        this._visualRoot.calculateAbsolutePos();
        this._flatVisualNodes = this._visualRoot.extract();
        if (!this._showRoot) {
            this._flatVisualNodes.shift();
        }
    }

    render(): void {
        if (!this._rootElem) {
            return;
        }

        this._renderItems(this._rootElem, this._flatVisualNodes);
        this._renderSmallItems();
    }

    private _renderSmallItems(): void {
        this._renderItemsSmall(this._controlInfo.previewItemsGroupElem, this._flatVisualNodes);
    }

    private _renderItems(parentNode: any, items: VisualNode[]): void {
        const self = this;
        let node = parentNode
            .selectAll('.node') //selectAll('g')
            .data(items, function (d: VisualNode) {
                return d.id;
            });

        node.exit()
            .each(function (d: VisualNode) {
                delete self._d3NodeDict[d.id];
            })
            .remove();

        node = node
            .enter()
            .append('g')
            .attr('class', function (d: VisualNode) {
                if (d.isSelected) {
                    return 'node selected';
                }
                return 'node';
            })
            .attr('id', function (d: VisualNode) {
                return d.id;
            })
            .attr('transform', nodeGroupTransform)
            .each(function (d: VisualNode) {
                // @ts-ignore: Unreachable code error
                self._d3NodeDict[d.id] = this;
            });

        node.append('rect')
            .attr('class', 'node-bg')
            .attr('width', nodeWidth)
            .attr('height', nodeHeight)
            .style('fill', nodeBgFillColor)
            .style('stroke', nodeStrokeColor);

        node.append('rect')
            .attr('class', 'node-header')
            .attr('width', nodeWidth)
            .attr('height', nodeHeaderBgHeight)
            .style('fill', nodeHeaderBgFillColor)
            .on('click', nodePerformSelect)
            .on('dblclick', nodePerformExpandCollapse);

        node.append('rect')
            .attr('class', 'node-header-hl')
            .attr('width', nodeHeaderBgWidth)
            .attr('height', nodeHeaderBgHeight)
            .style('fill', nodeHeaderHlFillColor)
            .on('click', nodePerformSelect)
            .on('dblclick', nodePerformExpandCollapse);

        node.append('image')
            .attr('class', 'node-logo')
            .attr('xlink:href', function (d: VisualNode) {
                // @ts-ignore: Unreachable code error
                return getEntityImgUrl(d.data.kind);
            })
            .attr('x', nodeHeaderX('logo'))
            .attr('y', nodeHeaderY('logo'))
            .attr('width', nodeHeaderWidth('logo'))
            .attr('height', nodeHeaderHeight('logo'))
            .on('click', nodePerformSelect)
            .on('dblclick', nodePerformExpandCollapse);

        node.append('text')
            .attr('class', 'node-title-kind')
            .text(nodeHeaderText('title-kind'))
            .attr('transform', nodeHeaderTransform('title-kind'))
            .on('click', nodePerformSelect)
            .on('dblclick', nodePerformExpandCollapse);

        node.append('text')
            .attr('class', 'node-title-name')
            .text(nodeHeaderText('title-name'))
            .attr('transform', nodeHeaderTransform('title-name'))
            .on('click', nodePerformSelect)
            .on('dblclick', nodePerformExpandCollapse);

        node.each(function (d: VisualNode) {
            self._renderNodeExpander(d);
            self._renderNodeSeverity(d);
            self._renderNodeFlags(d);
            self._renderNodeMarkers(d);
        });
    }

    private _renderNodeExpander(visualNode: VisualNode) {
        const selection = d3
            // @ts-ignore: Unreachable code error
            .select(visualNode.node)
            .selectAll('.node-expander')
            .data(visualNode.expanderNodes, (x: VisualNodeHeaderExpander) => {
                return x.headerName;
            });

        selection.exit().remove();

        selection
            .enter()
            .append('image')
            .attr('class', 'node-expander')
            .attr('xlink:href', (x) => x.imgSrc)
            .attr('x', (x) => x.x())
            .attr('y', (x) => x.y())
            .attr('width', (x) => x.width())
            .attr('height', (x) => x.height())
            // @ts-ignore: Unreachable code error
            .on('click', nodePerformExpandCollapse);
    }

    private _renderNodeSeverity(visualNode: VisualNode): void {
        {
            const selection = d3
                // @ts-ignore: Unreachable code error
                .select(visualNode.node)
                .selectAll('.node-severity')
                .data(visualNode.severityNodes, function (x: VisualNodeSeverity) {
                    return x.headerName;
                });

            selection.exit().remove();

            selection
                .enter()
                .append('rect')
                .attr('class', 'node-severity')
                .attr('x', (x) => x.x())
                .attr('y', (x) => x.y())
                .attr('width', (x) => x.width())
                .attr('height', (x) => x.height())
                .attr('rx', 10)
                .style('fill', (x) => x.fill)
                .style('stroke', 'rgb(53, 55, 62)')
                .style('stroke-width', '1')
                .on('click', (_e, d) => {
                    nodePerformSelect(_e, d.node);
                })
                .on('dblclick', (_e, d) => {
                    nodePerformExpandCollapse(_e, d.node);
                });
        }

        {
            // eslint-disable-next-line no-redeclare
            const selection = d3
                // @ts-ignore: Unreachable code error
                .select(visualNode.node)
                .selectAll('.node-severity-text')
                .data(visualNode.severityTextNodes, function (x: VisualNodeText) {
                    return x.headerName;
                });

            selection.exit().remove();

            selection
                .enter()
                .append('text')
                .attr('class', 'node-severity-text')
                .text((x) =>  x.text())
                .attr('transform', (x) => x.transform())
                .on('click', (_e, d) => {
                    nodePerformSelect(_e, d.node);
                })
                .on('dblclick', (_e, d) => {
                    nodePerformExpandCollapse(_e, d.node);
                });
        }
    }

    _renderNodeFlags(visualNode: VisualNode): void {
        const self = this;
        const selection = d3
            // @ts-ignore: Unreachable code error
            .select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeHeaderFlag>('.node-flag')
            .data(visualNode.flagNodes, (x) => {
                return x.headerName;
            });

        selection.exit().remove();

        selection
            .enter()
            .append('image')
            .attr('class', 'node-flag')
            .attr('xlink:href', (x) => x.imgSrc)
            .attr('x', (x) => x.x())
            .attr('y', (x) => x.y())
            .attr('width', (x) => x.width())
            .attr('height', (x) => x.height())
            .on('mouseover', function (_e, d) {
                // @ts-ignore: Unreachable code error
                self._showFlagTooltip(this, d.flag);
            });
    }

    private _renderNodeMarkers(visualNode: VisualNode): void {
        const self = this;
        let selection = d3
            // @ts-ignore: Unreachable code error
            .select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeHeaderMarker>('.node-marker')
            .data(visualNode.markerNodes, function (x) {
                return x.headerName;
            });

        selection.exit().remove();

        selection = selection
            .enter()
            .append('g')
            .attr('class', 'node-marker')
            .attr('id', function (d) {
                return d.node.id + d.headerName;
            })
            .attr('transform', (x) => x.transform())
            .on('mouseover', function (_e, d) {
                // @ts-ignore: Unreachable code error
                self._showMarkerTooltip(this, d.marker);
            });

        selection
            .append('rect')
            .attr('class', 'marker-bg')
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('width', 20)
            .attr('height', 20)
            .style('fill', '#292A2F');

        selection
            .append('text')
            .attr('class', 'marker-text')
            .attr('x', 10)
            .attr('y', 10)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'middle')
            .attr('fill', (x: VisualNodeHeaderMarker) => x.fill())
            .html((x: VisualNodeHeaderMarker) => x.html());
    }

    private _showFlagTooltip(elem: VisualView, name: string): void {
        const descr = flagTooltip(name);
        this._showTooltip(elem, descr);
    }

    private _showMarkerTooltip(elem: VisualView, name: string): void {
        const descr = 'Marker <b>' + name + '</b>';
        this._showTooltip(elem, descr);
    }

    private _showTooltip(elem: VisualView, descr: string): void {
        if (!descr) {
            return;
        }
        const template =
            '<div class="tooltip">' +
            '	<div class="tooltip-arrow"></div>' +
            '	<div class="tooltip-inner"></div>' +
            '</div>';
        // @ts-ignore: Unreachable code error
        $(elem).tooltip({
            template: template,
            title: descr,
            html: true,
        });
        // @ts-ignore: Unreachable code error
        $(elem).tooltip('show');
    }

    _updateNode(visualNode: VisualNode, isFullUpdate?: boolean): void {
        const duration = 200;

        if (!visualNode.node) {
            return;
        }

        if (isFullUpdate) {
            this._renderNodeExpander(visualNode);
            this._renderNodeSeverity(visualNode);
            this._renderNodeFlags(visualNode);
            this._renderNodeMarkers(visualNode);
        }

        // @ts-ignore: Unreachable code error
        d3.select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeHeaderFlag>('.node-flag')
            .transition()
            .duration(duration)
            .attr('x', (x) => {
                return x.x();
            })
            .attr('y', (x) => x.y());

        // @ts-ignore: Unreachable code error
        d3.select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeHeaderMarker>('.node-marker')
            .transition()
            .duration(duration)
            .attr('transform', (x) => x.transform());

        // @ts-ignore: Unreachable code error
        d3.select(visualNode.node)
            .selectAll('.node-marker')
            .selectAll<d3.BaseType, VisualNodeHeaderMarker>('.marker-text')
            .html((x) => x.html())
            .transition()
            .duration(duration)
            .attr('fill', (x) => x.fill()); 

        // @ts-ignore: Unreachable code error
        d3.select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeSeverity>('.node-severity')
            .transition()
            .duration(duration)
            .attr('x', function (x) {
                return x.x();
            });

        // @ts-ignore: Unreachable code error
        d3.select(visualNode.node)
            .selectAll<d3.BaseType, VisualNodeText>('.node-severity-text')
            .text((x) => {
                return x.text();
            })
            .transition()
            .duration(duration)
            .attr('transform', (x) => {
                return x.transform();
            });

        // @ts-ignore: Unreachable code error
        d3.select<d3.BaseType, VisualNode>(visualNode.node)
            .transition()
            .duration(duration)
            .attr('class', function (d) {
                if (d.isSelected) {
                    return 'node selected';
                }
                return 'node';
            })
            .attr('transform', nodeGroupTransform(visualNode));

        // @ts-ignore: Unreachable code error
        d3.select<d3.BaseType, VisualNode>(visualNode.node)
            .select('.node-bg')
            .transition()
            .duration(duration)
            .attr('width', nodeWidth(visualNode))
            .attr('height', nodeHeight(visualNode))
            .style('fill', nodeBgFillColor(visualNode))
            .style('stroke', nodeStrokeColor(visualNode));

        // @ts-ignore: Unreachable code error
        d3.select<d3.BaseType, VisualNode>(visualNode.node)
            .select('.node-header')
            .transition()
            .duration(duration)
            .attr('width', nodeWidth(visualNode))
            .attr('height', nodeHeaderBgHeight(visualNode))
            .style('fill', nodeHeaderBgFillColor(visualNode));

        // @ts-ignore: Unreachable code error
        d3.select<d3.BaseType, VisualNode>(visualNode.node)
            .select('.node-header-hl')
            .transition()
            .duration(duration)
            .attr('width', nodeHeaderBgWidth(visualNode))
            .attr('height', nodeHeaderBgHeight(visualNode))
            .style('fill', nodeHeaderHlFillColor(visualNode));

        // @ts-ignore: Unreachable code error
        d3.select<d3.BaseType, VisualNode>(visualNode.node)
            .select('.node-expander')
            .transition()
            .duration(duration)
            .attr('x', (x) => {
                const expanderNode = _.head(x.expanderNodes);
                if (expanderNode) {
                    return expanderNode.x();
                }
                return 0;
            })
            .attr('xlink:href', (x) => {
                const expanderNode = _.head(x.expanderNodes);
                if (expanderNode) {
                    return expanderNode.imgSrc;
                }
                return 0;
            });

        this._updateNodeSmall(visualNode);
    }

    private _renderItemsSmall(parentNode: VisualNode, items: VisualNode[]): void {
        const self = this;
        let node = parentNode
            // @ts-ignore: Unreachable code error
            .selectAll('g')
            .data(items, function (d: VisualNode) {
                return d.id;
            });

        node.exit()
            .each(function (d: VisualNode) {
                delete self._d3SmallNodeDict[d.id];
            })
            .remove();

        node = node
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('id', function (d: VisualNode) {
                return d.id;
            })
            .attr('transform', nodeGroupTransform)
            .each(function (d: VisualNode) {
                // @ts-ignore: Unreachable code error
                self._d3SmallNodeDict[d.id] = this;
            });

        node.append('rect')
            .attr('class', 'node-bg')
            .attr('width', function (d: VisualNode) {
                return d.width;
            })
            .attr('height', function (d: VisualNode) {
                return d.height;
            })
            .style('fill', nodeBgFillColor);

        node.append('rect')
            .attr('class', 'node-header-hl')
            .attr('width', function (d: VisualNode) {
                return d.width;
            })
            .attr('height', function (d: VisualNode) {
                return d.headerHeight;
            })
            .style('fill', nodeHeaderHlFillColor);
    }

    private _updateNodeSmall(visualNode: VisualNode): void {
        const duration = 200;

        if (!visualNode.smallNode) {
            return;
        }

        d3.select(visualNode.smallNode)
            .transition()
            .duration(duration)
            .attr('transform', nodeGroupTransform(visualNode));

        d3.select<d3.BaseType, VisualNode>(visualNode.smallNode)
            .select('.node-bg')
            .transition()
            .duration(duration)
            .attr('width', function (d) {
                return d.width;
            })
            .attr('height', function (d) {
                return d.height;
            });

        d3.select<d3.BaseType, VisualNode>(visualNode.smallNode)
            .select('.node-header-hl')
            .transition()
            .duration(duration)
            .attr('width', function (d) {
                return d.width;
            })
            .style('fill', nodeHeaderHlFillColor(visualNode));
    }

    private _updateNodeR(visualNode: VisualNode, isFullUpdate?: boolean): void {
        this._updateNode(visualNode, isFullUpdate);
        for (const child of visualNode.visibleChildren) {
            this._updateNodeR(child, isFullUpdate);
        }
    }

    private _updateSelection(selected_dn: string): void {
        if (this._currentSelectedNodeDn && this._currentSelectedNodeDn !== selected_dn) {
            const node: VisualNode = this._nodeDict[this._currentSelectedNodeDn];
            this._currentSelectedNodeDn = null;
            if (node) {
                this._updateNode(node);
            }
        }

        if (this._currentSelectedNodeDn !== selected_dn) {
            this._currentSelectedNodeDn = selected_dn;
            const node = this._nodeDict[selected_dn];
            if (node) {
                this._updateNode(node);
            }
        }

        this._activatePanning();
    }

    updateAll(isFullUpdate?: boolean): void {
        this._massageSourceData();
        this._applyPanTransform();
        this._setupControl();
        this.render();
        if (this._visualRoot) {
            this._updateNodeR(this._visualRoot, isFullUpdate);
        }
        this._setupControl();
        this._activatePanning();
    }

    handleVisualNodeClick(visualNode: VisualNode) {
        this.sharedState.set('auto_pan_to_selected_dn', false);

        if (visualNode.isSelected) {
            this.sharedState.set('selected_dn', null);
        } else {
            this.sharedState.set('selected_dn', visualNode.id);
        }
    }
}
