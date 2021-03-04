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

        const diagram = await findByTestId('diagram');

        expect(diagram);
    });
});
