document.addEventListener('DOMContentLoaded', function() {

    const listingTableBody = document.querySelector('tbody'); // Target the table body for delegation

    if (!listingTableBody) {
        console.error("Could not find table body (tbody) element.");
        return; // Stop if table body isn't found
    }

    // --- Helper Function to Toggle Edit/Display Views ---
    function toggleEditView(cell, showEditForm) {
        const displayDiv = cell.querySelector('.tags-display, .materials-display');
        const editFormDiv = cell.querySelector('.tags-edit-form, .materials-edit-form');
        const feedbackSpan = editFormDiv?.querySelector('.edit-feedback'); // Find feedback span inside edit form

        if (displayDiv && editFormDiv) {
            displayDiv.classList.toggle('hidden', showEditForm); // Hide display if showEditForm is true
            editFormDiv.classList.toggle('hidden', !showEditForm); // Show edit form if showEditForm is true

             // Clear feedback and re-enable buttons when switching views
            if(feedbackSpan) feedbackSpan.textContent = '';
            const saveBtn = editFormDiv.querySelector('.save-tags-btn, .save-materials-btn');
            const cancelBtn = editFormDiv.querySelector('.cancel-edit-btn');
            if (saveBtn) saveBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;

            // Focus the textarea when showing the edit form
            if (showEditForm) {
                const textarea = editFormDiv.querySelector('textarea');
                if (textarea) textarea.focus();
            }
        } else {
            console.warn("Could not find display or edit form divs within cell:", cell);
        }
    }

    // --- Event Listener for Clicks within the Table Body ---
    listingTableBody.addEventListener('click', async function(event) {
        const target = event.target; // The actual element that was clicked

        // --- Handle "Edit" Button Clicks (Tags or Materials) ---
        const editButton = target.closest('.edit-tags-btn, .edit-materials-btn');
        if (editButton) {
            const cell = editButton.closest('.listing-tags, .listing-materials');
            if (!cell) return;

            // Pre-fill textarea with current tags/materials
            const displayDiv = cell.querySelector('.tags-display, .materials-display');
            const badges = displayDiv.querySelectorAll('span:not(.italic)');
            const currentValues = Array.from(badges).map(span => span.textContent.trim());
            const textarea = cell.querySelector('textarea');
            if(textarea) {
                textarea.value = currentValues.join(', ');
            }
            toggleEditView(cell, true); // Show the edit form
            return; // Stop processing other click types
        }

        // --- Handle "Cancel" Button Clicks ---
        const cancelButton = target.closest('.cancel-edit-btn');
        if (cancelButton) {
            const cell = cancelButton.closest('.listing-tags, .listing-materials');
            if (!cell) return;
            toggleEditView(cell, false); // Hide edit form
            return; // Stop processing other click types
        }

        // --- Handle "Save" Button Clicks (Tags or Materials) ---
        const saveButton = target.closest('.save-tags-btn, .save-materials-btn');
        if (saveButton) {
            const cell = saveButton.closest('.listing-tags, .listing-materials');
            const editFormDiv = saveButton.closest('.tags-edit-form, .materials-edit-form');
            const feedbackSpan = editFormDiv?.querySelector('.edit-feedback');
            if (!cell || !editFormDiv || !feedbackSpan) return;

            const listingId = cell.dataset.listingId;
            const isTags = cell.classList.contains('listing-tags');
            const textarea = editFormDiv.querySelector('textarea');
            const inputText = textarea.value;

            const newValues = inputText.split(',')
                                      .map(item => item.trim())
                                      .filter(item => item !== '');

            if (isTags && newValues.length > 13) {
                 feedbackSpan.textContent = 'Error: Max 13 tags allowed.';
                 feedbackSpan.style.color = 'red';
                 return;
            }

            saveButton.disabled = true;
            const cancelBtn = editFormDiv.querySelector('.cancel-edit-btn');
            if (cancelBtn) cancelBtn.disabled = true;
            feedbackSpan.textContent = 'Saving...';
            feedbackSpan.style.color = 'inherit';

            const payload = {};
            if (isTags) { payload.tags = newValues; }
            else { payload.materials = newValues; }

            console.log(`Saving for listing ${listingId}:`, payload);

            try {
                const response = await fetch(`/listings/${listingId}/tags-materials`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    console.log('Save successful:', result);
                    feedbackSpan.textContent = 'Saved!';
                    feedbackSpan.style.color = 'green';

                    const displayDiv = cell.querySelector('.tags-display, .materials-display');
                    displayDiv.querySelectorAll('span:not(.italic)').forEach(span => span.remove());
                    const editBtnRef = displayDiv.querySelector('button'); // Reference point

                    if (newValues.length > 0) {
                         displayDiv.querySelector('.italic')?.remove();
                        newValues.forEach(value => {
                            const newBadge = document.createElement('span');
                            newBadge.className = 'inline-block bg-gray-100 rounded-full px-2 py-0.5 text-xs font-medium text-gray-700 mr-1 mb-1';
                            newBadge.textContent = value;
                            displayDiv.insertBefore(newBadge, editBtnRef);
                        });
                    } else {
                         if (!displayDiv.querySelector('.italic')) {
                             const noneSpan = document.createElement('span');
                             noneSpan.className = 'text-gray-400 italic';
                             noneSpan.textContent = 'None';
                             displayDiv.insertBefore(noneSpan, editBtnRef);
                         }
                    }
                    setTimeout(() => { toggleEditView(cell, false); }, 1000);
                } else {
                    console.error('Save failed:', result);
                    feedbackSpan.textContent = `Error: ${result.message || 'Unknown error'}`;
                    feedbackSpan.style.color = 'red';
                    saveButton.disabled = false; // Re-enable only save button on error? Or both?
                    if (cancelBtn) cancelBtn.disabled = false;
                }
            } catch (error) {
                console.error('Network or unexpected error:', error);
                feedbackSpan.textContent = `Error: ${error.message}`;
                feedbackSpan.style.color = 'red';
                saveButton.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
            }
            return; // Stop processing other click types
        } // End of Save Button Logic


        // --- <<<< HANDLE RENEW BUTTON CLICK (NOW AS ELSE IF) >>>> ---
        const renewButton = target.closest('.toggle-renew-btn');
        if (renewButton) {
            event.preventDefault(); // Good practice

            renewButton.disabled = true; // Prevent double-clicks

            const listingId = renewButton.dataset.listingId;
            const currentState = renewButton.dataset.currentState === 'true'; // Convert string to boolean
            const newState = !currentState;

            console.log(`Toggling RENEW for ${listingId} from ${currentState} to ${newState}`); // Log specific action

            try {
                // *** Ensure it calls the CORRECT endpoint: /renew ***
                const response = await fetch(`/listings/${listingId}/renew`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ newState: newState }) // Correct payload
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    console.log('Renew Update successful:', result);
                    // Update button appearance and state
                    renewButton.dataset.currentState = newState.toString();
                    renewButton.textContent = newState ? 'ON' : 'OFF';
                    // Update classes for styling
                    if (newState) {
                        renewButton.classList.remove('bg-red-100', 'text-red-800', 'hover:bg-red-200');
                        renewButton.classList.add('bg-green-100', 'text-green-800', 'hover:bg-green-200');
                    } else {
                        renewButton.classList.remove('bg-green-100', 'text-green-800', 'hover:bg-green-200');
                        renewButton.classList.add('bg-red-100', 'text-red-800', 'hover:bg-red-200');
                    }
                } else {
                    console.error('Renew Update failed:', result);
                    alert(`Failed to update auto-renew: ${result.message || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Renew Network error or JSON parsing error:', error);
                alert(`An error occurred during renew update: ${error.message}`);
            } finally {
                renewButton.disabled = false; // Re-enable button
            }
            // No return needed here as it's the last check
        } // --- End of Renew Button Logic ---

    }); // End of Table Body Click Listener

}); // End of DOMContentLoaded