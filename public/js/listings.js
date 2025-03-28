document.addEventListener('DOMContentLoaded', function() {
    // Select all checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const selectAllCheckbox = document.querySelector('thead input[type="checkbox"]');

    // Handle select all functionality
    selectAllCheckbox.addEventListener('change', function() {
        checkboxes.forEach(checkbox => {
            if (checkbox !== selectAllCheckbox) {
                checkbox.checked = selectAllCheckbox.checked;
            }
        });
    });

    // Category filter buttons
    const categoryButtons = document.querySelectorAll('.flex.space-x-4 button');
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            categoryButtons.forEach(btn => {
                btn.classList.remove('bg-indigo-100', 'text-indigo-600');
                btn.classList.add('hover:bg-gray-100');
            });
            
            // Add active class to clicked button
            this.classList.add('bg-indigo-100', 'text-indigo-600');
            this.classList.remove('hover:bg-gray-100');
        });
    });

    // Search functionality
    const searchInput = document.querySelector('input[placeholder="Search listings..."]');
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}); 