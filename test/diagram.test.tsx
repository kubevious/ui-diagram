import 'jest';

import React from 'react';
import { render } from '@testing-library/react';

import { Diagram } from '../src';

function renderDiagram() {
    return render(<Diagram />);
}

describe('Diagram', () => {
    test('Should check that the component Diagram is rendered', async () => {
        const { findByTestId } = renderDiagram();

        const copyClipboard = await findByTestId('diagram');

        expect(copyClipboard);
    });
});
