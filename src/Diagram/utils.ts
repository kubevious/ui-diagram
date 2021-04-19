import _ from 'the-lodash';
import { VisualNode } from './visual-node/visual-node';
import { prettyKind as helperPrettyKind, FLAG_TOOLTIPS } from '@kubevious/helpers/dist/docs';
import { FontSpec } from './types';

// _e - MouseEvent
export function nodePerformExpandCollapse(_e: any, d: VisualNode) {
    d.isExpanded = !d.isExpanded;
    d.view.updateAll();
}

// _e - MouseEvent
export function nodePerformSelect(_e: any, d: VisualNode) { 
    if (d.view) {
        d.view.handleVisualNodeClick(d);
    }
}

export function nodeHeight(d: VisualNode): number {
    return d.height;
}

export function nodeWidth(d: VisualNode): number {
    return d.width;
}

export function nodeHeaderBgHeight(d: VisualNode): number {
    return d.headerHeight;
}

export function nodeHeaderBgWidth(d: VisualNode): number {
    if (d.isSelected) {
        return d.width;
    }
    return d.headerHeight;
}

export function nodeHeaderBgFillColor(d: VisualNode): string {
    return d.headerBgFillColor;
}

export function nodeHeaderHlFillColor(d: VisualNode): string {
    return d.headerFillColor;
}

export function nodeBgFillColor(d: VisualNode): string {
    return d.bgFillColor;
}

export function nodeStrokeColor(d: VisualNode): string {
    return d.strokeColor;
}

export function nodeGroupTransform(d: VisualNode): string {
    return 'translate(' + d.absX + ',' + d.absY + ')';
}

export function nodeHeaderTransform(headerName: string, flavor?: string): (d: VisualNode) => string {
    return (d) => {
        return 'translate(' + d.getHeaderX(headerName, flavor) + ',' + d.getHeaderY(headerName, flavor) + ')';
    };
}

export function nodeHeaderX(headerName: string, flavor?: string): (d: VisualNode) => number {
    return (d) => {
        return d.getHeaderX(headerName, flavor);
    };
}

export function nodeHeaderY(headerName: string, flavor?: string): (d: VisualNode) => number {
    return (d) => {
        return d.getHeaderY(headerName, flavor);
    };
}

export function nodeHeaderWidth(headerName: string, flavor?: string): (d: VisualNode) => number {
    return (d) => {
        const header = d.getHeader(headerName);
        if (!header) {
            // TODO: Error
            return 0;
        }
        if (flavor) {
            return header[flavor].width;
        }
        return header.width;
    };
}

export function nodeHeaderHeight(headerName: string, flavor?: string): (d: VisualNode) => number {
    return (d) => {
        const header = d.getHeader(headerName);
        if (!header) {
            // TODO: Error
            return 0;
        }
        if (flavor) {
            return header[flavor].height;
        }
        return header.height;
    };
}

export function nodeHeaderText(headerName: string): (d: VisualNode) => number | string | undefined {
    return (d: VisualNode) => {
        const header = d.getHeader(headerName);
        if (!header) {
            // TODO: Error
            return '';
        }
        return header.text;
    };
}

export const flagTooltip = (name: string): string => {
    let value: string = FLAG_TOOLTIPS[name];
    if (!value) {
        value = '';
    }
    return value;
};

export const prettyKind = (kind: string): string => {
    let value = helperPrettyKind(kind);
    if (!value) {
        value = _.upperFirst(kind);
    }
    return value;
};


export function measureText(
    text: string | number | undefined,
    fontSpec?: FontSpec,
): {
    width: number;
    height: number;
} {
    if (!fontSpec) {
        throw new Error('MISSING FONT SPEC');
    }
    text = _.isNil(text) ? '' : text ? text.toString() : '';

    let totalWidth = 0;
    const totalHeight = fontSpec.height;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const index = code - fontSpec.startCode;
        let width: number;
        if (index < 0 || index >= fontSpec.widths.length) {
            width = fontSpec.defaultWidth;
        } else {
            width = fontSpec.widths[index];
        }
        totalWidth += width;
    }
    return {
        width: totalWidth,
        height: totalHeight,
    };
}
