/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublishForm } from './PublishForm';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('PublishForm component', () => {
  const mockPublish = jest.fn();

  beforeEach(() => {
    mockPublish.mockReset();
    mockPublish.mockResolvedValue({ ociReference: 'registry.example.com/test:0.1.0' });
  });

  it('renders the toggle button', () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    expect(screen.getByText(/Publish to OCI Registry/)).toBeTruthy();
  });

  it('shows form fields when toggle is clicked', () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    expect(screen.getByPlaceholderText('e.g. my-new-skill')).toBeTruthy();
    expect(screen.getByDisplayValue('0.1.0')).toBeTruthy();
    expect(screen.getByPlaceholderText('your-name or team')).toBeTruthy();
  });

  it('disables publish button when skillName is empty', () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    const publishBtn = screen.getByText('Publish') as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(true);
  });

  it('enables publish button when skillName is filled', () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    const input = screen.getByPlaceholderText('e.g. my-new-skill');
    fireEvent.change(input, { target: { value: 'test-skill' } });

    const publishBtn = screen.getByText('Publish') as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(false);
  });

  it('calls onPublish with correct params and shows success', async () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    fireEvent.change(screen.getByPlaceholderText('e.g. my-new-skill'), {
      target: { value: 'my-skill' },
    });
    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith({
        skillName: 'my-skill',
        version: '0.1.0',
        author: 'skill-marketplace',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Published to OCI Registry/)).toBeTruthy();
      expect(screen.getByText('registry.example.com/test:0.1.0')).toBeTruthy();
    });
  });

  it('shows error message on publish failure', async () => {
    mockPublish.mockRejectedValueOnce(new Error('Network error'));
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    fireEvent.change(screen.getByPlaceholderText('e.g. my-new-skill'), {
      target: { value: 'my-skill' },
    });
    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('pre-fills name from prefill prop', () => {
    render(
      <PublishForm onPublish={mockPublish} prefill={{ name: 'prefilled-name', version: '2.0.0' }} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    expect(screen.getByDisplayValue('prefilled-name')).toBeTruthy();
    expect(screen.getByDisplayValue('2.0.0')).toBeTruthy();
  });

  it('shows link to skills catalog after successful publish', async () => {
    render(<PublishForm onPublish={mockPublish} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Publish to OCI Registry/));

    fireEvent.change(screen.getByPlaceholderText('e.g. my-new-skill'), {
      target: { value: 'my-skill' },
    });
    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => {
      expect(screen.getByText('View in Skills Catalog')).toBeTruthy();
    });
  });
});
