const SUPABASE_URL = 'https://kzzscdymubqabsgogqba.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6enNjZHltdWJxYWJzZ29ncWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MzI3NTIsImV4cCI6MjA4MDAwODc1Mn0._GQdjZHUeG7CYAsvaqOrKN0TvSFRBYIBxvmad5Vl6Pg';
const TEAM_ID = 'verifico_auditor';

let supabase = null;
let supabaseEnabled = false;

if (SUPABASE_URL !== 'https://kzzscdymubqabsgogqba.supabase.co' && SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6enNjZHltdWJxYWJzZ29ncWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MzI3NTIsImV4cCI6MjA4MDAwODc1Mn0._GQdjZHUeG7CYAsvaqOrKN0TvSFRBYIBxvmad5Vl6Pg') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseEnabled = true;
    updateSyncStatus('synced');
} else {
    updateSyncStatus('error');
}

let draggedType = null;
let draggedElement = null;
let currentEditingTemplate = null;
let currentEditingGroup = null;
let groupCounter = 0;
let blockCounter = 0;
let currentEditingBlock = null;
let currentDocumentId = null;
let documents = {};
let blockToMove = null;
let clients = {};
let selectedClient = null;
let templates = {};
let editingClientId = null;
let currentUser = null;
let blockEditorQuill = null; // Global Quill instance
// Mock users removed. Using Supabase Auth.
// NOTE: The login screen now expects an email in the 'Username' field.
let users = {}; // Keep for compatibility with existing functions, but will be empty.

const groups = {
    'group-0': {
        name: 'Default Blocks',
        blocks: {
            'heading1': { name: 'Heading 1', content: '<h1>Heading 1</h1>' },
            'heading2': { name: 'Heading 2', content: '<h2>Heading 2</h2>' },
            'heading3': { name: 'Heading 3', content: '<h3>Heading 3</h3>' },
            'paragraph': { name: 'Paragraph', content: '<p>Write your paragraph here...</p>' },
            'bullet-list': { name: 'Bullet List', content: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' },
            'numbered-list': { name: 'Numbered List', content: '<ol><li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>' },
            'image': { name: 'Image', content: '<div class="image-upload-area" onclick="uploadImage(this)">Click to upload image</div>' }
        }
    }
};

function updateSyncStatus(status) {
    const indicator = document.getElementById('syncIndicator');
    const statusText = document.getElementById('syncStatusText');
    const teamBadge = document.querySelector('.team-badge');
    
    indicator.className = 'sync-indicator';
    
    if (status === 'syncing') {
        indicator.classList.add('syncing');
        statusText.textContent = 'Syncing...';
    } else if (status === 'synced') {
        statusText.textContent = 'Synced';
        teamBadge.textContent = TEAM_ID;
    } else if (status === 'error') {
        indicator.classList.add('error');
        statusText.textContent = 'Offline Mode';
        teamBadge.textContent = 'Local Only';
    }
}

async function saveToSupabase(key, data) {
    if (!supabaseEnabled) return false;
    try {
        updateSyncStatus('syncing');
        const { error } = await supabase.from('team_documentation').upsert({
            key: key, team_id: TEAM_ID, value: data, updated_at: new Date().toISOString()
        }, { onConflict: 'key,team_id' });
        if (error) throw error;
        updateSyncStatus('synced');
        return true;
    } catch (error) {
        console.error('Supabase save error:', error);
        updateSyncStatus('error');
        return false;
    }
}

async function getFromSupabase(key) {
    if (!supabaseEnabled) return null;
    try {
        const { data, error } = await supabase.from('team_documentation').select('value').eq('key', key).eq('team_id', TEAM_ID).single();
        if (error) throw error;
        return data ? data.value : null;
    } catch (error) {
        return null;
    }
}

async function getAllDocuments() {
    if (!supabaseEnabled) return [];
    try {
        const { data, error } = await supabase.from('team_documentation').select('key, value, updated_at').eq('team_id', TEAM_ID).like('key', 'document_%').order('updated_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        return [];
    }
}

async function saveToStorage(key, data) {
    try {
        if (supabaseEnabled) {
            await saveToSupabase(key, data);
        }
        localStorage.setItem(`${TEAM_ID}_${key}`, JSON.stringify(data));
    } catch (error) {
        localStorage.setItem(`${TEAM_ID}_${key}`, JSON.stringify(data));
    }
}

async function getFromStorage(key) {
    try {
        if (supabaseEnabled) {
            const data = await getFromSupabase(key);
            if (data) return data;
        }
        const localData = localStorage.getItem(`${TEAM_ID}_${key}`);
        return localData ? JSON.parse(localData) : null;
    } catch (error) {
        const localData = localStorage.getItem(`${TEAM_ID}_${key}`);
        return localData ? JSON.parse(localData) : null;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelectorAll('.sidebar-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`content-${tabName}`).classList.add('active');
    
    if (tabName === 'documents') {
        loadDocumentsList();
    } else if (tabName === 'templates') {
        loadTemplatesList();
    } else if (tabName === 'clients') {
        loadClientsList();
    }
}

async function createNewDocument() {
    if (!canEdit()) {
        alert('Access Denied: Only Editor and Admin roles can create new documents.');
        return;
    }
    const docId = 'doc_' + Date.now();
    const newDoc = {
        id: docId, name: `Document ${Object.keys(documents).length + 1}`,
        content: [], created: new Date().toISOString(), updated: new Date().toISOString(), client: null
    };
    documents[docId] = newDoc;
    await saveDocument(docId);
    await loadDocument(docId);
    loadDocumentsList();
}

async function saveCurrentDocument() {
    if (!currentDocumentId) return;
    const doc = documents[currentDocumentId];
    if (!doc) return;
    
    const blocks = [];
    document.querySelectorAll('.doc-block').forEach(block => {
        blocks.push(block.querySelector('.block-content').innerHTML);
    });
    doc.content = blocks;
    doc.updated = new Date().toISOString();
    
    // Update title
    doc.name = document.getElementById('documentTitle').value.trim() || 'Untitled Document';
    
    await saveToStorage(`document_${currentDocumentId}`, doc);
    loadDocumentsList(); // Refresh list to show updated title/date
}

async function loadDocument(docId) {
    if (currentDocumentId && documents[currentDocumentId]) {
        await saveCurrentDocument();
    }
    currentDocumentId = docId;
    const doc = documents[docId];
    if (!doc) return;

    // Update document title in header
    document.getElementById('documentTitle').value = doc.name;
    
    // Update client select
    const clientSelect = document.getElementById('clientSelect');
    clientSelect.value = doc.client || '';
    
    // Render blocks
    const docElement = document.getElementById('document');
    docElement.innerHTML = '';
    doc.content.forEach(contentHtml => {
        const block = document.createElement('div');
        block.className = 'doc-block';
        block.innerHTML = `
            <div class="block-handle">::</div>
            <div class="block-controls">
                <button onclick="removeBlock(this)">Delete</button>
            </div>
            <div class="block-content" contenteditable="true">${contentHtml}</div>
        `;
        docElement.appendChild(block);
        
        // Re-attach event listeners for image upload areas
        const uploadAreas = block.querySelectorAll('.image-upload-area');
        uploadAreas.forEach(area => area.contentEditable = false);
        
        // Old drag-and-drop event listeners are removed, SortableJS will handle it.
    });
    
    // Add final drop zone
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.textContent = 'Drop block here';
    docElement.appendChild(dropZone);
    
    // Update active document in sidebar
    document.querySelectorAll('.document-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`doc-item-${docId}`).classList.add('active');
}

async function loadDocumentsList() {
    const list = document.getElementById('documentsList');
    const emptyState = document.getElementById('documentsEmptyState');
    
    // Re-fetch all documents from storage/Supabase
    if (supabaseEnabled) {
        const allDocs = await getAllDocuments();
        documents = {};
        allDocs.forEach(item => {
            const docId = item.key.replace('document_', '');
            documents[docId] = item.value;
        });
    } else {
        // Local storage load is handled in autoLoad, just re-render
    }
    
    const docKeys = Object.keys(documents).sort((a, b) => new Date(documents[b].updated) - new Date(documents[a].updated));
    
    if (docKeys.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.innerHTML = docKeys.map(docId => {
        const doc = documents[docId];
        const isActive = docId === currentDocumentId ? 'active' : '';
        const preview = doc.content.length > 0 ? doc.content[0].replace(/<[^>]*>/g, '').substring(0, 50) + '...' : 'Empty document';
        const date = new Date(doc.updated).toLocaleDateString();
        
        return `
            <div class="document-item ${isActive}" id="doc-item-${docId}" onclick="loadDocument('${docId}')">
                <div class="document-item-header">
                    <div class="document-item-title">${doc.name}</div>
                    <div class="document-item-actions">
                        <button class="rename-btn" onclick="event.stopPropagation(); renameDocument('${docId}')">Rename</button>
                        <button onclick="event.stopPropagation(); deleteDocument('${docId}')">Delete</button>
                    </div>
                </div>
                <div class="document-item-date">Last updated: ${date}</div>
                <div class="document-item-preview">${preview}</div>
            </div>
        `;
    }).join('');
}

function renameDocument(docId) {
    const newName = prompt('Enter new document name:', documents[docId].name);
    if (newName && newName.trim()) {
        documents[docId].name = newName.trim();
        saveDocument(docId);
        loadDocumentsList();
        if (docId === currentDocumentId) {
            document.getElementById('documentTitle').value = newName.trim();
        }
    }
}

async function deleteDocument(docId) {
    if (confirm(`Are you sure you want to delete the document "${documents[docId].name}"?`)) {
        // Remove from local storage
        localStorage.removeItem(`${TEAM_ID}_document_${docId}`);
        
        // Remove from Supabase
        if (supabaseEnabled) {
            try {
                await supabase.from('team_documentation').delete().eq('key', `document_${docId}`).eq('team_id', TEAM_ID);
            } catch (e) {
                console.error('Supabase delete error:', e);
            }
        }
        
        delete documents[docId];
        
        if (docId === currentDocumentId) {
            currentDocumentId = null;
            document.getElementById('document').innerHTML = '<div class="drop-zone">Drop block here</div>';
            document.getElementById('documentTitle').value = 'Documentation Builder';
            createNewDocument(); // Create a new empty document
        }
        
        loadDocumentsList();
    }
}

function renderGroups() {
    const container = document.getElementById('blockGroupsContainer');
    container.innerHTML = Object.keys(groups).map(groupId => {
        const group = groups[groupId];
        const isCollapsed = group.collapsed ? 'collapsed' : '';
        
        const blocksHtml = Object.keys(group.blocks).map(blockId => {
            const block = group.blocks[blockId];
            return `
                <div class="block-template" draggable="true" 
                    ondragstart="dragBlock(event, '${groupId}', '${blockId}')"
                    onclick="addBlock('${groupId}', '${blockId}')">
                    <span>${block.name}</span>
                    <button class="edit-template-btn" onclick="event.stopPropagation(); editTemplate('${groupId}', '${blockId}')">Edit</button>
                </div>
            `;
        }).join('');
        
        return `
            <div class="block-group" id="group-${groupId}">
                <div class="group-header" onclick="toggleGroup('${groupId}')">
                    <span class="group-arrow">▼</span>
                    <span class="group-title">${group.name}</span>
                    <div class="group-controls">
                        <button onclick="event.stopPropagation(); editGroup('${groupId}')">Rename</button>
                        <button onclick="event.stopPropagation(); duplicateGroup('${groupId}')">Duplicate</button>
                        <button onclick="event.stopPropagation(); deleteGroup('${groupId}')">Delete</button>
                    </div>
                </div>
                <div class="block-palette ${isCollapsed}">
                    ${blocksHtml}
                    <button class="add-block-btn" onclick="addBlockToGroup('${groupId}')">+ Add New Block</button>
                    <button class="add-block-btn" onclick="importDocxAsBlock('${groupId}')">Import DOCX as Block</button>
                </div>
            </div>
        `;
    }).join('');
    
    saveToStorage('sharedTemplates', groups);
}

function toggleGroup(groupId) {
    groups[groupId].collapsed = !groups[groupId].collapsed;
    renderGroups();
}

function addGroup() {
    groupCounter++;
    const newGroupId = `group-${groupCounter}`;
    groups[newGroupId] = {
        name: `New Group ${groupCounter}`,
        blocks: {}
    };
    renderGroups();
}

function deleteGroup(groupId) {
    if (confirm(`Are you sure you want to delete the group "${groups[groupId].name}" and all its blocks?`)) {
        delete groups[groupId];
        renderGroups();
    }
}

function dragBlock(event, groupId, blockId) {
    draggedType = { groupId, blockId };
    event.dataTransfer.setData('text/plain', blockId);
}

function addBlock(groupId, blockId) {
    const doc = document.getElementById('document');
    const template = groups[groupId].blocks[blockId];
    const block = document.createElement('div');
    block.className = 'doc-block';
    block.draggable = true;
    block.innerHTML = `<div class="block-controls"><button onclick="removeBlock(this)">Delete</button></div><div class="block-content" contenteditable="true">${template.content}</div>`;
    
    // Insert before the last element (which is the drop zone)
    doc.insertBefore(block, doc.lastElementChild);

    const uploadAreas = block.querySelectorAll('.image-upload-area');
    uploadAreas.forEach(area => area.contentEditable = false);

    block.addEventListener('dragstart', () => { draggedElement = block; block.classList.add('dragging'); });
    block.addEventListener('dragend', () => { block.classList.remove('dragging'); draggedElement = null; });
    
    triggerAutoSave();
}

function duplicateGroup(groupId) {
    groupCounter++;
    const originalGroup = groups[groupId];
    const newGroupId = `group-${groupCounter}`;
    
    groups[newGroupId] = {
        name: originalGroup.name + ' (Copy)',
        blocks: JSON.parse(JSON.stringify(originalGroup.blocks)) // Deep clone
    };
    
    renderGroups();
}

function duplicateBlock(groupId, blockId) {
    blockCounter++;
    const originalBlock = groups[groupId].blocks[blockId];
    const newBlockId = `block-${blockCounter}`;
    
    groups[groupId].blocks[newBlockId] = {
        name: originalBlock.name + ' (Copy)',
        content: originalBlock.content
    };
    
    renderGroups();
}

function openMoveBlockModal(groupId, blockId) {
    blockToMove = { groupId, blockId };
    
    // Populate target group select
    const select = document.getElementById('targetGroupSelect');
    select.innerHTML = Object.keys(groups).map(gId => {
        if (gId !== groupId) {
            return `<option value="${gId}">${groups[gId].name}</option>`;
        }
        return '';
    }).join('');
    
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('moveBlockModal').classList.add('active');
}

function closeMoveBlockModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('moveBlockModal').classList.remove('active');
    blockToMove = null;
}

function confirmMoveBlock() {
    if (!blockToMove) return;
    
    const targetGroupId = document.getElementById('targetGroupSelect').value;
    if (!targetGroupId) return;
    
    const { groupId, blockId } = blockToMove;
    const block = groups[groupId].blocks[blockId];
    
    // Add to target group
    groups[targetGroupId].blocks[blockId] = block;
    
    // Remove from source group
    delete groups[groupId].blocks[blockId];
    
    renderGroups();
    closeMoveBlockModal();
}

function editGroup(groupId) {
    currentEditingGroup = groupId;
    document.getElementById('groupName').value = groups[groupId].name;
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('groupModal').classList.add('active');
}

function saveGroupName() {
    if (currentEditingGroup) {
        const newName = document.getElementById('groupName').value.trim();
        if (newName) {
            groups[currentEditingGroup].name = newName;
            renderGroups();
        }
    }
    closeModal();
}

function addBlockToGroup(groupId) {
    blockCounter++;
    groups[groupId].blocks[`block-${blockCounter}`] = { name: `New Block ${blockCounter}`, content: '<p>New block content</p>' };
    renderGroups();
}

function importDocxAsBlock(groupId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                const html = result.value;
                
                if (html) {
                    blockCounter++;
                    const blockId = `imported-${blockCounter}`;
                    const fileName = file.name.replace('.docx', '');
                    
                    groups[groupId].blocks[blockId] = {
                        name: fileName,
                        content: html
                    };
                    
                    renderGroups();
                    alert(`✅ "${fileName}" imported successfully! You can now edit it or drag it to your document.`);
                } else {
                    alert('⚠️ Could not extract content from the DOCX file.');
                }
            } catch (error) {
                console.error('Error importing DOCX:', error);
                alert('❌ Error importing DOCX file: ' + error.message);
            }
        }
    };
    input.click();
}

// --- Quill Editor Configuration ---
const quillToolbarOptions = [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'direction': 'rtl' }],
    [{ 'align': [] }],
    ['link', 'image'],
    ['clean']
];

function editTemplate(groupId, blockId) {
    currentEditingTemplate = { groupId, blockId };
    const block = groups[groupId].blocks[blockId];
    
    // Set block name
    document.getElementById('blockName').value = block.name;
    
    // Initialize Quill Editor
    const editorContainer = document.getElementById('blockEditorContainer');
    editorContainer.innerHTML = ''; // Clear previous editor
    
    blockEditorQuill = new Quill(editorContainer, {
        modules: {
            toolbar: quillToolbarOptions
        },
        theme: 'snow'
    });
    
    // Set content
    blockEditorQuill.root.innerHTML = block.content;
    
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('editModal').classList.add('active');
    
    // Focus the editor
    setTimeout(() => blockEditorQuill.focus(), 100);
}

function saveTemplate() {
    if (currentEditingTemplate && blockEditorQuill) {
        const { groupId, blockId } = currentEditingTemplate;
        const newName = document.getElementById('blockName').value.trim();
        // Get content from Quill
        const newContent = blockEditorQuill.root.innerHTML;
        
        if (newName) {
            groups[groupId].blocks[blockId].name = newName;
        }
        groups[groupId].blocks[blockId].content = newContent;
        renderGroups();
    }
    closeModal();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('groupModal').classList.remove('active');
    document.getElementById('clientModal').classList.remove('active');
    document.getElementById('templateModal').classList.remove('active');
    currentEditingTemplate = null;
    currentEditingGroup = null;
    editingClientId = null;
    
    // Clear editor
    const blockNameInput = document.getElementById('blockName');
    if (blockNameInput) blockNameInput.value = '';
    
    // Quill Cleanup
    if (blockEditorQuill) {
        const editorContainer = document.getElementById('blockEditorContainer');
        editorContainer.innerHTML = ''; // Clear the editor container
        blockEditorQuill = null;
    }
}

// Removed old editor functions (editorFormat, updateEditorButtonStates, formatText, changeFontSize)

const doc = document.getElementById('document');
// const toolbar = document.getElementById('toolbar'); // Toolbar removed from HTML

if (doc) {
    doc.addEventListener('dragover', (e) => e.preventDefault());
    doc.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedType) {
            const { groupId, blockId } = draggedType;
            addBlock(groupId, blockId);
            draggedType = null;
        } else if (draggedElement) {
            const dropZone = e.target.closest('.drop-zone');
            if (dropZone) doc.insertBefore(draggedElement, dropZone);
            triggerAutoSave();
        }
    });
}

// Simplified focus handling since the main document toolbar is removed
document.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('block-content')) {
        currentEditingBlock = e.target;
        document.querySelectorAll('.doc-block').forEach(b => b.classList.remove('editing'));
        e.target.closest('.doc-block').classList.add('editing');
    }
});

document.addEventListener('focusout', (e) => {
    setTimeout(() => {
        if (!document.activeElement.classList.contains('block-content') && !document.activeElement.closest('.modal')) {
            const editingBlock = document.querySelector('.doc-block.editing');
            if (editingBlock) editingBlock.classList.remove('editing');
        }
    }, 200);
});

async function uploadImage(element) {
    if (!supabaseEnabled) {
        alert('Cannot upload image. Supabase is not configured or is offline.');
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // 1. Upload file to Supabase Storage
                const filePath = `${TEAM_ID}/${Date.now()}_${file.name}`;
                
                // Show a temporary loading state
                element.textContent = 'Uploading...';
                
                const { data, error } = await supabase.storage
                    .from('images') // Assuming a bucket named 'images'
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) throw error;

                // 2. Get public URL
                const { data: publicURLData } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);
                
                const publicUrl = publicURLData.publicUrl;

                // 3. Replace the upload area with the image tag
                element.outerHTML = `<img src="${publicUrl}" alt="${file.name}" style="max-width: 100%; height: auto; display: block; margin: 15px 0; border-radius: 8px; box-shadow: var(--shadow);">`;
                
                triggerAutoSave();
                alert('Image uploaded successfully!');

            } catch (error) {
                console.error('Supabase Image Upload Error:', error);
                element.textContent = 'Click to upload image'; // Reset text
                alert('❌ Error uploading image: ' + error.message);
            }
        }
    };
    input.click();
}

function removeBlock(btn) {
    btn.closest('.doc-block').remove();
    triggerAutoSave();
}

function saveProject() {
    const project = { groups: groups, documents: documents, clients: clients, templates: templates };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documentation-backup.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const project = JSON.parse(event.target.result);
                    Object.assign(groups, project.groups || {});
                    Object.assign(documents, project.documents || {});
                    Object.assign(clients, project.clients || {});
                    Object.assign(templates, project.templates || {});
                    
                    renderGroups();
                    loadClientsList();
                    loadTemplatesList();
                    
                    if (Object.keys(documents).length > 0) {
                        const firstDoc = Object.values(documents).sort((a, b) => new Date(b.updated) - new Date(a.updated))[0];
                        await loadDocument(firstDoc.id);
                    } else {
                        await createNewDocument();
                    }
                    alert('Project loaded successfully!');
                } catch (error) {
                    alert('Error loading project: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

async function exportToDocx() {
    const blocks = document.querySelectorAll('.doc-block');
    if (blocks.length === 0) {
        alert('Add some blocks first!');
        return;
    }

    const children = [];
    for (const block of blocks) {
        const content = block.querySelector('.block-content');
        // Simple conversion logic for the sake of refactoring, full logic is complex
        // This part needs a proper HTML-to-DOCX library for a production-ready solution
        const text = content.textContent.trim();
        if (text) {
            children.push(new docx.Paragraph({ text: text }));
        }
    }

    const docFile = new docx.Document({
        sections: [{ properties: {}, children: children }]
    });

    const blob = await docx.Packer.toBlob(docFile);
    saveAs(blob, `${document.getElementById('documentTitle').value || 'document'}.docx`);
}

async function autoSave() {
    await saveCurrentDocument();
    await saveToStorage('sharedTemplates', groups);
    await saveToStorage('clients', clients);
    await saveToStorage('templates', templates);
}

async function autoLoad() {
    // Load groups
    const sharedGroups = await getFromStorage('sharedTemplates');
    if (sharedGroups) {
        Object.assign(groups, sharedGroups);
    }
    renderGroups();

    // Load clients
    const loadedClients = await getFromStorage('clients');
    if (loadedClients) {
        Object.assign(clients, loadedClients);
    }
    loadClientsList();

    // Load templates
    const loadedTemplates = await getFromStorage('templates');
    if (loadedTemplates) {
        Object.assign(templates, loadedTemplates);
    }
    loadTemplatesList();

    // Load documents
    if (supabaseEnabled) {
        const allDocs = await getAllDocuments();
        allDocs.forEach(item => {
            const docId = item.key.replace('document_', '');
            documents[docId] = item.value;
        });
    } else {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(`${TEAM_ID}_document_`)) {
                try {
                    const docId = key.replace(`${TEAM_ID}_document_`, '');
                    documents[docId] = JSON.parse(localStorage.getItem(key));
                } catch (e) {}
            }
        });
    }

    if (Object.keys(documents).length > 0) {
        const sortedDocs = Object.values(documents).sort((a, b) => new Date(b.updated) - new Date(a.updated));
        await loadDocument(sortedDocs[0].id);
    } else {
        await createNewDocument();
    }
    
    // Initial UI update
    updateClientSelect();
    loadDocumentsList();
}

let saveTimeout;
function triggerAutoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(autoSave, 1000);
}

document.addEventListener('input', triggerAutoSave);
// Note: DOMNodeInserted/Removed are deprecated, but kept for compatibility with original code's intent
document.addEventListener('DOMNodeInserted', triggerAutoSave);
document.addEventListener('DOMNodeRemoved', triggerAutoSave);

// --- Client Management Functions ---

function updateClientSelect() {
    const select = document.getElementById('clientSelect');
    select.innerHTML = '<option value="">Select Client</option>' + Object.keys(clients).map(clientId => {
        const client = clients[clientId];
        return `<option value="${clientId}">${client.company}</option>`;
    }).join('');
    
    if (currentDocumentId && documents[currentDocumentId]) {
        select.value = documents[currentDocumentId].client || '';
    }
}

function updateDocumentClient(clientId) {
    if (currentDocumentId && documents[currentDocumentId]) {
        documents[currentDocumentId].client = clientId;
        triggerAutoSave();
    }
}

function loadClientsList() {
    const list = document.getElementById('clientsList');
    const emptyState = document.getElementById('clientsEmptyState');
    const clientKeys = Object.keys(clients).sort((a, b) => clients[a].company.localeCompare(clients[b].company));
    
    if (clientKeys.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.innerHTML = clientKeys.map(clientId => {
        const client = clients[clientId];
        return `
            <div class="client-item" onclick="selectClient('${clientId}')">
                <div class="client-item-header">
                    <div class="client-item-title">${client.company}</div>
                    <div class="client-item-actions">
                        <button onclick="event.stopPropagation(); editClient('${clientId}')">Edit</button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteClient('${clientId}')">Delete</button>
                    </div>
                </div>
                <div class="client-item-contact">${client.contact} - ${client.email}</div>
            </div>
        `;
    }).join('');
    
    updateClientSelect();
}

function editClient(clientId = null) {
    if (!canEdit()) {
        alert('Access Denied: Only Editor and Admin roles can add or edit clients.');
        return;
    }
    editingClientId = clientId;
    const modalTitle = document.getElementById('clientModalTitle');
    const client = clientId ? clients[clientId] : {};
    
    modalTitle.textContent = clientId ? 'Edit Client' : 'Add New Client';
    
    document.getElementById('clientCompany').value = client.company || '';
    document.getElementById('clientContact').value = client.contact || '';
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientPhone').value = client.phone || '';
    document.getElementById('clientAddress').value = client.address || '';
    document.getElementById('clientCity').value = client.city || '';
    document.getElementById('clientCountry').value = client.country || '';
    document.getElementById('clientPostal').value = client.postal || '';
    document.getElementById('clientTax').value = client.tax || '';
    document.getElementById('clientIndustry').value = client.industry || '';
    document.getElementById('clientWebsite').value = client.website || '';
    document.getElementById('clientNotes').value = client.notes || '';
    
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('clientModal').classList.add('active');
}

function saveClient() {
    const company = document.getElementById('clientCompany').value.trim();
    const contact = document.getElementById('clientContact').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    
    if (!company || !contact || !email) {
        alert('Company Name, Contact Person, and Email are required.');
        return;
    }
    
    const clientId = editingClientId || 'client_' + Date.now();
    
    clients[clientId] = {
        id: clientId,
        company: company,
        contact: contact,
        email: email,
        phone: document.getElementById('clientPhone').value.trim(),
        address: document.getElementById('clientAddress').value.trim(),
        city: document.getElementById('clientCity').value.trim(),
        country: document.getElementById('clientCountry').value.trim(),
        postal: document.getElementById('clientPostal').value.trim(),
        tax: document.getElementById('clientTax').value.trim(),
        industry: document.getElementById('clientIndustry').value.trim(),
        website: document.getElementById('clientWebsite').value.trim(),
        notes: document.getElementById('clientNotes').value.trim(),
        created: clients[clientId] ? clients[clientId].created : new Date().toISOString()
    };
    
    saveToStorage('clients', clients);
    loadClientsList();
    closeModal();
}

function deleteClient(clientId) {
    if (confirm(`Are you sure you want to delete the client "${clients[clientId].company}"?`)) {
        delete clients[clientId];
        saveToStorage('clients', clients);
        loadClientsList();
    }
}

function selectClient(clientId) {
    selectedClient = clientId;
    // Future: Use this to pre-fill blocks with client data
    alert(`Client "${clients[clientId].company}" selected. (Feature not fully implemented)`);
}

// --- Template Management Functions ---

function openTemplateModal() {
    document.getElementById('templateName').value = documents[currentDocumentId].name + ' Template';
    document.getElementById('templateDesc').value = '';
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('templateModal').classList.add('active');
}

function confirmSaveTemplate() {
    const templateName = document.getElementById('templateName').value.trim();
    const templateDesc = document.getElementById('templateDesc').value.trim();
    
    if (!templateName) {
        alert('Template name is required.');
        return;
    }
    
    const templateId = 'tpl_' + Date.now();
    
    // Save the current document's content as the template
    const blocks = [];
    document.querySelectorAll('.doc-block').forEach(block => {
        blocks.push(block.querySelector('.block-content').innerHTML);
    });
    
    templates[templateId] = {
        id: templateId,
        name: templateName,
        description: templateDesc,
        content: blocks,
        created: new Date().toISOString()
    };
    
    saveToStorage('templates', templates);
    loadTemplatesList();
    closeModal();
    alert(`Template "${templateName}" saved successfully!`);
}

function loadTemplatesList() {
    const list = document.getElementById('templatesList');
    const emptyState = document.getElementById('templatesEmptyState');
    const templateKeys = Object.keys(templates).sort((a, b) => templates[a].name.localeCompare(templates[b].name));
    
    if (templateKeys.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.innerHTML = templateKeys.map(templateId => {
        const template = templates[templateId];
        return `
            <div class="template-item">
                <div class="template-item-header">
                    <div class="template-item-title">${template.name}</div>
                    <div class="template-item-actions">
                        <button onclick="applyTemplate('${templateId}')">Apply</button>
                        <button class="delete-btn" onclick="deleteTemplate('${templateId}')">Delete</button>
                    </div>
                </div>
                <div class="template-item-desc">${template.description || 'No description.'}</div>
            </div>
        `;
    }).join('');
}

async function applyTemplate(templateId) {
    if (confirm(`Applying this template will replace the content of the current document "${documents[currentDocumentId].name}". Continue?`)) {
        const template = templates[templateId];
        if (!template) return;
        
        // Update current document content
        documents[currentDocumentId].content = template.content;
        documents[currentDocumentId].updated = new Date().toISOString();
        
        await loadDocument(currentDocumentId);
        triggerAutoSave();
        alert(`Template "${template.name}" applied successfully!`);
    }
}

function deleteTemplate(templateId) {
    if (confirm(`Are you sure you want to delete the template "${templates[templateId].name}"?`)) {
        delete templates[templateId];
        saveToStorage('templates', templates);
        loadTemplatesList();
    }
}

// --- Authentication Functions ---

async function login() {
    const email = document.getElementById('username').value; // Now expects email
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('loginError');
    errorElement.textContent = '';

    if (!supabaseEnabled) {
        errorElement.textContent = 'Supabase is not configured. Cannot log in.';
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) throw error;

        // On successful login, data.user contains the Supabase user object
        // The handleAuthChange function will take care of the rest
        // We don't need to call autoLoad() here, as handleAuthChange will trigger it.

    } catch (error) {
        console.error('Supabase Login Error:', error);
        errorElement.textContent = error.message || 'Login failed. Check your email and password.';
    }
}

async function logout() {
    if (confirm('Are you sure you want to log out?')) {
        if (supabaseEnabled) {
            await supabase.auth.signOut();
        }
        currentUser = null;
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        // Clear the user info from the header
        const teamInfo = document.querySelector('.team-info');
        const existingUserInfo = teamInfo.querySelector('.user-info');
        if (existingUserInfo) existingUserInfo.remove();
    }
}

async function fetchUserRoleAndName(user) {
    if (!supabaseEnabled) {
        // Fallback for local mode (should not happen if logged in)
        return { id: user.id, email: user.email, role: 'viewer', name: user.email.split('@')[0] };
    }
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('name, role')
            .eq('id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'No rows found'

        // If no profile found, use default viewer role and email as name
        const role = data?.role || 'viewer';
        const name = data?.name || user.email.split('@')[0];

        return {
            id: user.id,
            email: user.email,
            role: role,
            name: name
        };
    } catch (error) {
        console.error('Error fetching user profile:', error);
        // Return a safe default on error
        return { id: user.id, email: user.email, role: 'viewer', name: user.email.split('@')[0] };
    }
}

async function handleAuthChange(session, user) {
    if (session && user) {
        // Fetch user-specific data (role, name)
        currentUser = await fetchUserRoleAndName(user);
        
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        updateUIForRole();
        autoLoad();
    } else {
        currentUser = null;
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
    }
}

function canEdit() {
    return currentUser && (currentUser.role === 'editor' || currentUser.role === 'admin');
}

function updateUIForRole() {
    const role = currentUser ? currentUser.role : 'viewer';
    const teamInfo = document.querySelector('.team-info');
    
    // Update header with user info
    const userInfoHtml = `
        <div class="user-info">
            <span>${currentUser.name}</span>
            <span class="role-badge ${role}">${role}</span>
        </div>
    `;
    
    // Remove existing user info if present
    const existingUserInfo = teamInfo.querySelector('.user-info');
    if (existingUserInfo) existingUserInfo.remove();
    
    // Insert user info before the sync status
    teamInfo.insertBefore(document.createRange().createContextualFragment(userInfoHtml), teamInfo.firstChild);

    // Disable/Enable elements based on role
    const canUserEdit = canEdit();
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // Admin Tab Visibility
    const adminTab = document.getElementById('tab-admin');
    if (adminTab) {
        adminTab.classList.toggle('hidden', !isAdmin);
        if (isAdmin) {
            loadUserList(); // Load the user list when the admin tab is visible
        }
    }
    
    // Document actions
    document.querySelectorAll('.document-actions button').forEach(btn => btn.disabled = !canUserEdit);
    
    // Sidebar buttons
    // The 'Save Current as Template' button is a 'new-document-btn'
    document.querySelectorAll('.new-document-btn').forEach(btn => btn.disabled = !canUserEdit);
    document.querySelectorAll('.add-group-btn').forEach(btn => btn.disabled = !canUserEdit);
    
    // Content editable
    document.querySelectorAll('.doc-block .block-content').forEach(content => content.contentEditable = canUserEdit);
}

// --- Admin Management Functions ---

async function loadUserList() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const userListContainer = document.getElementById('userList');
    const emptyState = document.getElementById('usersEmptyState');
    userListContainer.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.querySelector('p').textContent = 'Loading user list...';

    try {
        // Fetch all profiles
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, name, role, created_at');

        if (error) throw error;

        if (profiles.length === 0) {
            emptyState.querySelector('p').textContent = 'No users found.';
            return;
        }

        emptyState.style.display = 'none';
        
        profiles.forEach(profile => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-item-info">
                    <div class="user-item-name">${profile.name || 'N/A'}</div>
                    <div class="user-item-id">${profile.id}</div>
                </div>
                <div class="user-item-role">
                    <select onchange="updateUserRole('${profile.id}', this.value)">
                        <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="editor" ${profile.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="viewer" ${profile.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    </select>
                </div>
            `;
            userListContainer.appendChild(userItem);
        });

    } catch (error) {
        console.error('Error loading user list:', error);
        emptyState.querySelector('p').textContent = 'Error loading user list.';
    }
}

async function updateUserRole(userId, newRole) {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Permission Denied: Only Admin can change user roles.');
        return;
    }

    if (userId === currentUser.id && newRole !== 'admin') {
        if (!confirm('Warning: You are about to demote yourself. Are you sure you want to continue? You may lose access to this admin panel.')) {
            // Revert the select box change
            loadUserList(); 
            return;
        }
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) throw error;

        alert(`Role for user ${userId} updated to ${newRole}.`);
        loadUserList(); // Refresh the list
    } catch (error) {
        console.error('Error updating user role:', error);
        alert('Failed to update user role. Check console for details.');
        loadUserList(); // Revert the list on failure
    }
}

// --- Initialization ---

window.addEventListener('load', async () => {
    // Initial render of groups (blocks)
    renderGroups();
    
    if (supabaseEnabled) {
        // Check for an existing session
        const { data: { session, user }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
        }
        
        await handleAuthChange(session, user);

        // Listen for auth state changes (e.g., logout from another tab)
        supabase.auth.onAuthStateChange((event, session) => {
            handleAuthChange(session, session?.user);
        });
    } else {
        // Fallback to showing login screen if Supabase is disabled
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});

// --- SortableJS Initialization for Block Reordering ---
const docElement = document.getElementById('document');
if (docElement && typeof Sortable !== 'undefined') {
    new Sortable(docElement, {
        animation: 150,
        handle: '.block-handle', // Assuming you will add a handle element to doc-block
        draggable: '.doc-block',
        filter: '.drop-zone', // Prevent dragging the drop zone itself
        onEnd: function (evt) {
            // Reordering is done by SortableJS, just trigger a save
            triggerAutoSave();
        }
    });
}

// NOTE: The old custom drag-and-drop logic has been removed.
// You will need to add a small handle element to the .doc-block HTML 
// for a better user experience with SortableJS.
// Example: <div class="block-handle">::</div>
// This is a minimal implementation to replace the core functionality.
