import { render, screen } from '@testing-library/react';
import App from './App';

test('renders App component header', () => {
  render(<App />);
  const titleElement = screen.getByText(/日本語 Practice/i);
  expect(titleElement).toBeInTheDocument();
});
