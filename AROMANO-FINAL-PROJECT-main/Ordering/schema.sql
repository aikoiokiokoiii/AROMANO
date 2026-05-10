CREATE DATABASE IF NOT EXISTS aromano_db;
USE aromano_db;

-- CUSTOMERS
CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PRODUCTS
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    fragrance_family VARCHAR(100),
    size_ml INT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INT DEFAULT 0,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ORDERS
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- ORDER ITEMS
CREATE TABLE order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,

    FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE CASCADE,

    FOREIGN KEY (product_id)
        REFERENCES products(product_id)
);

-- SAMPLE PRODUCTS
INSERT INTO products
(
    brand,
    product_name,
    description,
    fragrance_family,
    size_ml,
    price,
    stock_quantity,
    image_url
)
VALUES
(
    'Dior',
    'Sauvage',
    'Fresh spicy masculine fragrance',
    'Fresh',
    100,
    120.00,
    25,
    '/Images/sauvage.jpg'
),
(
    'Chanel',
    'Bleu de Chanel',
    'Woody aromatic fragrance',
    'Woody',
    100,
    135.00,
    18,
    '/Images/bleu.jpg'
),
(
    'Versace',
    'Eros',
    'Sweet aromatic fragrance',
    'Aromatic',
    100,
    95.00,
    30,
    '/Images/eros.jpg'
);

-- SAMPLE CUSTOMERS
INSERT INTO customers
(
    first_name,
    last_name,
    email,
    phone,
    address
)
VALUES
(
    'Kyle',
    'Denzel',
    'kyle@example.com',
    '09123456789',
    'Philippines'
);