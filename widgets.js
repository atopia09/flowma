// ============================================================
// Flowma — Widget Manager
// ============================================================

class WidgetManager {
    constructor(app) {
        this.app = app;
        this.widgets = new Map();
        this.widgetTypes = [
            { type: 'clock', name: 'Clock', icon: '🕐', desc: 'Live time display' },
            { type: 'todo', name: 'To-Do List', icon: '📝', desc: 'Task checklist' },
            { type: 'pomodoro-counter', name: 'Sessions', icon: '🍅', desc: 'Completed sessions' },
            { type: 'quote', name: 'Quotes', icon: '💬', desc: 'Motivational quote' },
            { type: 'date', name: 'Date', icon: '📅', desc: "Today's date" },
            { type: 'breathing', name: 'Breathe', icon: '🫁', desc: 'Box breathing guide' },
        ];
        this.gridSize = 40;
        this.nextId = 1;
        this.clockInterval = null;
        this.breathingIntervals = {};
        this.quotes = [
            "The secret of getting ahead is getting started.",
            "Focus on being productive instead of busy.",
            "It's not about time, it's about priorities.",
            "Deep work is the ability to focus without distraction.",
            "One step at a time is all it takes.",
            "Your focus determines your reality.",
            "The only way to do great work is to love what you do.",
            "Start where you are. Use what you have. Do what you can.",
            "Discipline is choosing between what you want now and what you want most.",
            "Small daily improvements over time lead to stunning results.",
            "Don't count the days. Make the days count.",
            "Success is the sum of small efforts repeated daily.",
        ];
    }

    init() {
        this.widgetArea = document.getElementById('widget-area');
        this.sidebar = document.getElementById('widget-sidebar');
        this.catalogGrid = this.sidebar.querySelector('.widget-catalog-grid');
        this.snapGuideH = document.getElementById('snap-guide-h');
        this.snapGuideV = document.getElementById('snap-guide-v');
        
        document.getElementById('widget-sidebar-close').addEventListener('click', () => {
            this.closeSidebar();
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('nav-timer').classList.add('active');
        });

        this._renderCatalog();
        this._loadWidgets();
        this._startClockUpdates();
    }

    _renderCatalog() {
        this.catalogGrid.innerHTML = '';
        this.widgetTypes.forEach(widgetInfo => {
            const item = document.createElement('div');
            item.className = 'widget-catalog-item';
            
            item.innerHTML = `
                <div class="widget-catalog-icon">${widgetInfo.icon}</div>
                <div class="widget-catalog-info">
                    <div class="widget-catalog-name">${widgetInfo.name}</div>
                    <div class="widget-catalog-desc">${widgetInfo.desc}</div>
                </div>
                <div class="widget-catalog-drag-hint">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                    </svg>
                </div>
            `;
            
            const startDrag = (e) => {
                e.preventDefault();
                this._onDragStart(e, widgetInfo.type, widgetInfo.icon);
            };
            
            item.addEventListener('mousedown', startDrag);
            item.addEventListener('touchstart', startDrag, { passive: false });
            this.catalogGrid.appendChild(item);
        });
    }

    _onDragStart(e, widgetType, icon) {
        let isTouch = e.type === 'touchstart';
        let startX = isTouch ? e.touches[0].clientX : e.clientX;
        let startY = isTouch ? e.touches[0].clientY : e.clientY;

        const ghost = document.createElement('div');
        ghost.className = 'widget-drag-ghost';
        ghost.textContent = icon;
        document.body.appendChild(ghost);
        
        ghost.style.left = startX + 'px';
        ghost.style.top = startY + 'px';

        const sidebarRect = this.sidebar.getBoundingClientRect();
        
        this.widgetArea.classList.add('active-grid');

        const move = (ev) => {
            if (!isTouch) ev.preventDefault();
            let x = isTouch ? ev.touches[0].clientX : ev.clientX;
            let y = isTouch ? ev.touches[0].clientY : ev.clientY;

            // Snap ghost position while dragging from catalog
            const snapped = this._snapPosition(x - 100, y - 50);
            ghost.style.left = snapped.x + 'px';
            ghost.style.top = snapped.y + 'px';

            const canDrop = x < sidebarRect.left;
            ghost.classList.toggle('can-drop', canDrop);
        };

        const stop = (ev) => {
            document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', move);
            document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stop);
            this.widgetArea.classList.remove('active-grid');

            let x = isTouch ? ev.changedTouches[0].clientX : ev.clientX;
            let y = isTouch ? ev.changedTouches[0].clientY : ev.clientY;

            if (x < sidebarRect.left) {
                // Drop successful
                ghost.classList.add('dropping');
                const snapped = this._snapPosition(x - 100, y - 50);
                this._placeWidget(widgetType, snapped.x, snapped.y);
                setTimeout(() => ghost.remove(), 300);
            } else {
                ghost.remove();
            }
        };

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', move, { passive: !isTouch });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', stop);
    }

    _snapPosition(x, y) {
        const ww = window.innerWidth;
        const wh = window.innerHeight;
        
        // Snap to grid
        x = Math.round(x / this.gridSize) * this.gridSize;
        y = Math.round(y / this.gridSize) * this.gridSize;

        // Clamp to screen
        x = Math.max(this.gridSize, Math.min(x, ww - 240));
        y = Math.max(this.gridSize, Math.min(y, wh - 240));

        return { x, y };
    }

    _showSnapGuides(x, y) {
        // Obsolete, replaced by active-grid
    }

    _hideSnapGuides() {
        // Obsolete, replaced by active-grid
    }

    _placeWidget(type, x, y, id = null, data = null, width = null, height = null) {
        const widgetId = id || `w_${Date.now()}_${this.nextId++}`;
        const widgetInfo = this.widgetTypes.find(w => w.type === type);
        if (!widgetInfo) return;

        const el = document.createElement('div');
        el.className = 'placed-widget';
        el.id = widgetId;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        
        if (width) el.style.width = width + 'px';
        if (height) el.style.height = height + 'px';

        el.innerHTML = `
            <button class="widget-close" aria-label="Close widget">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <div class="widget-header">
                <div class="widget-title">
                    <span>${widgetInfo.icon}</span>
                    <span>${widgetInfo.name}</span>
                </div>
            </div>
            <div class="widget-content"></div>
            <!-- Resize Handles -->
            <div class="resize-handle handle-nw" data-dir="nw"></div>
            <div class="resize-handle handle-n" data-dir="n"></div>
            <div class="resize-handle handle-ne" data-dir="ne"></div>
            <div class="resize-handle handle-e" data-dir="e"></div>
            <div class="resize-handle handle-se" data-dir="se"></div>
            <div class="resize-handle handle-s" data-dir="s"></div>
            <div class="resize-handle handle-sw" data-dir="sw"></div>
            <div class="resize-handle handle-w" data-dir="w"></div>
        `;

        el.querySelector('.widget-close').addEventListener('click', () => {
            this._removeWidget(widgetId);
        });

        const content = el.querySelector('.widget-content');
        this._renderWidgetContent(content, type, widgetId, data);

        this.widgetArea.appendChild(el);
        this._makeDraggable(el, widgetId);
        this._makeResizable(el, widgetId);

        this.widgets.set(widgetId, { type, el, x, y, data, width, height });
        this._saveWidgets();
    }

    _removeWidget(id) {
        const widget = this.widgets.get(id);
        if (!widget) return;
        
        widget.el.style.transform = 'scale(0.8)';
        widget.el.style.opacity = '0';
        
        if (this.breathingIntervals[id]) {
            clearInterval(this.breathingIntervals[id]);
            delete this.breathingIntervals[id];
        }

        setTimeout(() => {
            widget.el.remove();
            this.widgets.delete(id);
            this._saveWidgets();
        }, 300);
    }

    _makeDraggable(el, widgetId) {
        let offsetX, offsetY;
        
        const dragStart = (e) => {
            // Only drag if not clicking on an interactive element (input, button, close icon, resize handle)
            if (e.target.closest('input, button, .widget-close, .widget-todo-checkbox, .widget-todo-remove, .resize-handle')) return;
            
            // Stop propagation to prevent any global click handlers from interfering with drag
            e.stopPropagation();
            
            let isTouch = e.type === 'touchstart';
            let startX = isTouch ? e.touches[0].clientX : e.clientX;
            let startY = isTouch ? e.touches[0].clientY : e.clientY;

            const rect = el.getBoundingClientRect();
            offsetX = startX - rect.left;
            offsetY = startY - rect.top;
            
            el.classList.add('dragging');
            this.widgetArea.classList.add('active-grid');
            
            const dragMove = (ev) => {
                if (!isTouch) ev.preventDefault();
                let x = isTouch ? ev.touches[0].clientX : ev.clientX;
                let y = isTouch ? ev.touches[0].clientY : ev.clientY;
                
                // Snap to grid
                const snapped = this._snapPosition(x - offsetX, y - offsetY);
                el.style.left = snapped.x + 'px';
                el.style.top = snapped.y + 'px';
            };
            
            const dragEnd = () => {
                document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', dragMove);
                document.removeEventListener(isTouch ? 'touchend' : 'mouseup', dragEnd);
                el.classList.remove('dragging');
                this.widgetArea.classList.remove('active-grid');
                
                // Snap to final position
                const finalX = parseInt(el.style.left) || 0;
                const finalY = parseInt(el.style.top) || 0;
                const finalSnapped = this._snapPosition(finalX, finalY);
                el.style.left = finalSnapped.x + 'px';
                el.style.top = finalSnapped.y + 'px';

                const w = this.widgets.get(widgetId);
                if (w) {
                    w.x = finalSnapped.x;
                    w.y = finalSnapped.y;
                    this._saveWidgets();
                }
            };
            
            document.addEventListener(isTouch ? 'touchmove' : 'mousemove', dragMove, { passive: !isTouch });
            document.addEventListener(isTouch ? 'touchend' : 'mouseup', dragEnd);
        };
        
        el.addEventListener('mousedown', dragStart);
        el.addEventListener('touchstart', dragStart, { passive: false });
    }

    _makeResizable(el, widgetId) {
        const resizer = el.querySelector('.widget-resizer');
        if (!resizer) return;
        
        let isResizing = false;
        let startW, startH, startX, startY;
        
        const resizeStart = (e) => {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            
            isResizing = true;
            let isTouch = e.type === 'touchstart';
            startX = isTouch ? e.touches[0].clientX : e.clientX;
            startY = isTouch ? e.touches[0].clientY : e.clientY;
            
            const rect = el.getBoundingClientRect();
            startW = rect.width;
            startH = rect.height;
            
            this.widgetArea.classList.add('active-grid');
            
            const resizeMove = (ev) => {
                if (!isResizing) return;
                let x = isTouch ? ev.touches[0].clientX : ev.clientX;
                let y = isTouch ? ev.touches[0].clientY : ev.clientY;
                
                let newW = startW + (x - startX);
                let newH = startH + (y - startY);
                
                // Snap to grid for size
                newW = Math.round(newW / this.gridSize) * this.gridSize;
                newH = Math.round(newH / this.gridSize) * this.gridSize;
                
                // Min sizes
                newW = Math.max(160, newW);
                newH = Math.max(120, newH);
                
                el.style.width = newW + 'px';
                el.style.height = newH + 'px';
            };
            
            const resizeEnd = () => {
                isResizing = false;
                document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', resizeMove);
                document.removeEventListener(isTouch ? 'touchend' : 'mouseup', resizeEnd);
                this.widgetArea.classList.remove('active-grid');
                
                const w = this.widgets.get(widgetId);
                if (w) {
                    w.width = parseInt(el.style.width);
                    w.height = parseInt(el.style.height);
                    this._saveWidgets();
                }
            };
            
            document.addEventListener(isTouch ? 'touchmove' : 'mousemove', resizeMove, { passive: false });
            document.addEventListener(isTouch ? 'touchend' : 'mouseup', resizeEnd);
        };
        
        resizer.addEventListener('mousedown', resizeStart);
        resizer.addEventListener('touchstart', resizeStart, { passive: false });
    }

    _renderWidgetContent(container, type, widgetId, data) {
        container.innerHTML = '';
        
        // Disable spacebar playing timer inside inputs
        container.addEventListener('keydown', (e) => {
            if (e.code === 'Space') e.stopPropagation();
        });

        if (type === 'clock') this._renderClock(container);
        else if (type === 'todo') this._renderTodo(container, widgetId, data);
        else if (type === 'pomodoro-counter') this._renderPomodoroCounter(container);
        else if (type === 'quote') this._renderQuote(container, data);
        else if (type === 'date') this._renderDate(container);
        else if (type === 'breathing') this._renderBreathing(container, widgetId);
    }

    _renderClock(container) {
        container.innerHTML = `<div class="widget-clock-time"></div>`;
        this._updateClock(container.querySelector('.widget-clock-time'));
    }

    _updateClock(el) {
        if (!el) return;
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        el.textContent = `${h}:${m}`;
    }

    _startClockUpdates() {
        this.clockInterval = setInterval(() => {
            document.querySelectorAll('.widget-clock-time').forEach(el => this._updateClock(el));
        }, 1000);
    }

    _renderTodo(container, widgetId, data) {
        const todos = data || [];
        
        container.innerHTML = `
            <div class="widget-todo">
                <div class="widget-todo-input-row">
                    <input type="text" class="widget-todo-input" placeholder="Add a task...">
                    <button class="widget-todo-add">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                </div>
                <div class="widget-todo-list"></div>
            </div>
        `;

        const input = container.querySelector('.widget-todo-input');
        const addBtn = container.querySelector('.widget-todo-add');
        const list = container.querySelector('.widget-todo-list');

        const renderList = () => {
            list.innerHTML = '';
            todos.forEach((t, i) => {
                const item = document.createElement('div');
                item.className = 'widget-todo-item';
                item.innerHTML = `
                    <input type="checkbox" class="widget-todo-checkbox" ${t.done ? 'checked' : ''}>
                    <div class="widget-todo-text" title="${this._escapeHtml(t.text)}">${this._escapeHtml(t.text)}</div>
                    <button class="widget-todo-remove">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                `;
                
                item.querySelector('.widget-todo-checkbox').addEventListener('change', (e) => {
                    t.done = e.target.checked;
                    this._saveWidgetData(widgetId, todos);
                });
                
                item.querySelector('.widget-todo-remove').addEventListener('click', () => {
                    todos.splice(i, 1);
                    renderList();
                    this._saveWidgetData(widgetId, todos);
                });
                
                list.appendChild(item);
            });
        };

        const addTodo = () => {
            const text = input.value.trim();
            if (text) {
                todos.push({ text, done: false });
                input.value = '';
                renderList();
                this._saveWidgetData(widgetId, todos);
            }
        };

        addBtn.addEventListener('click', addTodo);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTodo();
        });

        renderList();
    }

    _renderPomodoroCounter(container) {
        container.innerHTML = `
            <div class="widget-counter">
                <div class="widget-counter-number">${this.app.completedSessions || 0}</div>
                <div class="widget-counter-label">Sessions</div>
            </div>
        `;
    }

    updatePomodoroCounters() {
        document.querySelectorAll('.widget-counter-number').forEach(el => {
            el.textContent = this.app.completedSessions || 0;
        });
    }

    _renderQuote(container, data) {
        const text = data || this.quotes[Math.floor(Math.random() * this.quotes.length)];
        container.innerHTML = `
            <div class="widget-quote">
                <div class="widget-quote-mark">"</div>
                <div class="widget-quote-text">${text}</div>
            </div>
        `;
    }

    _renderDate(container) {
        const now = new Date();
        const day = now.toLocaleDateString(undefined, { weekday: 'long' });
        const date = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
        container.innerHTML = `
            <div class="widget-date">
                <div class="widget-date-day">${day}</div>
                <div class="widget-date-full">${date}</div>
            </div>
        `;
    }

    _renderBreathing(container, widgetId) {
        container.innerHTML = `
            <div class="widget-breathing">
                <div class="breathing-circle">
                    <div class="breathing-circle-inner"></div>
                </div>
                <div class="breathing-label">Inhale</div>
            </div>
        `;
        
        const circle = container.querySelector('.breathing-circle');
        const label = container.querySelector('.breathing-label');
        const phases = [
            { class: 'inhale', text: 'Inhale' },
            { class: 'hold-in', text: 'Hold' },
            { class: 'exhale', text: 'Exhale' },
            { class: 'hold-out', text: 'Hold' }
        ];
        let p = 0;
        
        const tick = () => {
            circle.className = 'breathing-circle ' + phases[p].class;
            label.textContent = phases[p].text;
            p = (p + 1) % 4;
        };
        
        tick();
        this.breathingIntervals[widgetId] = setInterval(tick, 3800);
    }

    _saveWidgetData(id, data) {
        const w = this.widgets.get(id);
        if (w) {
            w.data = data;
            this._saveWidgets();
        }
    }

    _saveWidgets() {
        const dataToSave = [];
        for (const [id, w] of this.widgets.entries()) {
            dataToSave.push({ id, type: w.type, x: w.x, y: w.y, data: w.data, width: w.width, height: w.height });
        }
        localStorage.setItem('ff-widgets', JSON.stringify(dataToSave));
    }

    _loadWidgets() {
        try {
            const saved = JSON.parse(localStorage.getItem('ff-widgets') || '[]');
            saved.forEach(w => {
                this._placeWidget(w.type, w.x, w.y, w.id, w.data, w.width, w.height);
            });
        } catch (e) {
            console.warn('Failed to load widgets', e);
        }
    }

    openSidebar() {
        this.sidebar.classList.add('open');
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('open');
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
