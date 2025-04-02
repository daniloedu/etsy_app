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

    // Search functionality
    const searchInput = document.querySelector('input[placeholder="Search orders..."]');
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });

    // Export functionality
    const exportButton = document.querySelector('button:has(.material-icons)');
    exportButton.addEventListener('click', function() {
        const checkedRows = document.querySelectorAll('tbody tr:has(input:checked)');
        const data = Array.from(checkedRows).map(row => {
            return {
                id: row.cells[1].textContent,
                customer: row.cells[2].textContent,
                items: row.cells[3].textContent,
                total: row.cells[4].textContent,
                status: row.cells[5].textContent,
                date: row.cells[6].textContent
            };
        });
        
        // Create CSV content
        const csvContent = "data:text/csv;charset=utf-8," 
            + "Order ID,Customer,Items,Total,Status,Date\n"
            + data.map(row => Object.values(row).join(",")).join("\n");
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "orders.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}); 