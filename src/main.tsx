import { render } from 'preact';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);
