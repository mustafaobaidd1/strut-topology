import { mount } from 'svelte';
import App from './ui/App.svelte';

const target = document.querySelector<HTMLDivElement>('#app');
if (!target) throw new Error('#app not found');

mount(App, { target });
document.documentElement.dataset.ready = 'true';
