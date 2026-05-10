INSERT INTO customers (
    customer_id,
    first_name,
    last_name,
    email,
    phone,
    address,
    created_at
  )
VALUES (
    customer_id:int,
    'first_name:varchar',
    'last_name:varchar',
    'email:varchar',
    'phone:varchar',
    'address:text',
    'created_at:timestamp'
  );
  
  INSERT INTO customers (
      customer_id,
      first_name,
      last_name,
      email,
      phone,
      address,
      created_at
    )
  VALUES (
      customer_id:int,
      'first_name:varchar',
      'last_name:varchar',
      'email:varchar',
      'phone:varchar',
      'address:text',
      'created_at:timestamp'
    );

    INSERT INTO products (
        product_id,
        brand,
        product_name,
        description,
        fragrance_family,
        size_ml,
        price,
        stock_quantity,
        created_at,
        image_url
      )
    VALUES (
        product_id:int,
        'brand:varchar',
        'product_name:varchar',
        'description:text',
        'fragrance_family:varchar',
        size_ml:int,
        'price:decimal',
        stock_quantity:int,
        'created_at:timestamp',
        'image_url:varchar'
      );