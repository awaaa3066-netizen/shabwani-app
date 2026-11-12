import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DishItem, CartItem, Order, CategoryId, RestaurantSettings, CustomerProfile } from './types/restaurant';
import { CATEGORIES } from './data/defaultMenu';
import {
  getStoredMenu,
  getStoredOrders,
  getStoredSettings,
} from './utils/storage';
import {
  fetchCloudMenu,
  fetchCloudSettings,
  fetchCloudOrders,
  subscribeToMenuUpdates,
  subscribeToSettingsUpdates,
  subscribeToOrders,
  getSavedCustomerProfile,
  saveCloudOrder,
} from './utils/firebaseStorage';
import { Navbar, AppView } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { CategoryNav } from './components/CategoryNav';
import { DishCard } from './components/DishCard';
import { CartDrawer } from './components/CartDrawer';
import { InPageCart } from './components/InPageCart';
import { OrderConfirmationModal } from './components/OrderConfirmationModal';
import { AdminPriceManager } from './components/AdminPriceManager';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { CustomerAuthModal } from './components/CustomerAuthModal';
import { Footer } from './components/Footer';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [menu, setMenu] = useState<DishItem[]>(() => getStoredMenu());
  const [orders, setOrders] = useState<Order[]>(() => getStoredOrders());
  const [settings, setSettings] = useState<RestaurantSettings>(() => getStoredSettings());
  const [currentProfile, setCurrentProfile] = useState<CustomerProfile | null>(() => getSavedCustomerProfile());
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isFirstVisitAuth, setIsFirstVisitAuth] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('al_thawq_shabwani_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentView, setCurrentView] = useState<AppView>('menu');
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const menuSectionRef = useRef<HTMLDivElement>(null);

  // 1. Initial Cloud Sync and First Visit Detection
  useEffect(() => {
    // Check if customer profile exists; if first visit, show welcome login/register modal
    const profile = getSavedCustomerProfile();
    const hasSeenPrompt = sessionStorage.getItem('al_thawq_seen_auth_prompt');
    if (!profile && !hasSeenPrompt) {
      setIsFirstVisitAuth(true);
      setIsProfileModalOpen(true);
      sessionStorage.setItem('al_thawq_seen_auth_prompt', 'true');
    }

    // Fetch latest cloud state from Firestore
    fetchCloudSettings().then((s) => setSettings(s));
    fetchCloudMenu().then((m) => {
      if (m && m.length > 0) setMenu(m);
    });
    fetchCloudOrders().then((o) => {
      if (o && o.length > 0) setOrders(o);
    });

    // Subscribe to live cloud updates
    const unsubMenu = subscribeToMenuUpdates((newMenu) => {
      setMenu(newMenu);
    });
    const unsubSettings = subscribeToSettingsUpdates((newSettings) => {
      setSettings(newSettings);
    });
    const unsubOrders = subscribeToOrders((newOrders) => {
      setOrders(newOrders);
    });

    return () => {
      unsubMenu();
      unsubSettings();
      unsubOrders();
    };
  }, []);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('al_thawq_shabwani_cart', JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to persist cart', e);
    }
  }, [cart]);

  // Cart totals
  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.dish.price * item.quantity, 0),
    [cart]
  );

  // Cart operations
  const handleAddToCart = (dish: DishItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.dish.id === dish.id);
      if (existing) {
        return prevCart.map((item) =>
          item.dish.id === dish.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { dish, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (dishId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(dishId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.dish.id === dishId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveFromCart = (dishId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.dish.id !== dishId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleOrderSuccess = async (newOrder: Order) => {
    await saveCloudOrder(newOrder);
    setOrders((prev) => [newOrder, ...prev]);
    setCart([]);
    setIsCartOpen(false);
    setConfirmedOrder(newOrder);
  };

  const handleScrollToMenu = () => {
    if (menuSectionRef.current) {
      menuSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryId, number> = {
      all: menu.length,
      shawarma: 0,
      pizza: 0,
      pastries: 0,
      crispy: 0,
      juices: 0,
      family_bottles: 0,
    };

    menu.forEach((dish) => {
      if (counts[dish.category] !== undefined) {
        counts[dish.category]++;
      }
    });

    return counts;
  }, [menu]);

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return menu.filter((dish) => {
      const matchesCategory =
        activeCategory === 'all' || dish.category === activeCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        dish.name.toLowerCase().includes(query) ||
        dish.description.toLowerCase().includes(query) ||
        (dish.tags && dish.tags.some((t) => t.toLowerCase().includes(query)));

      return matchesCategory && matchesSearch;
    });
  }, [menu, activeCategory, searchQuery]);

  const currentCategoryObj = CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans" dir="rtl">
      {/* 1. Header / Top Navigation Bar with View Tabs */}
      <Navbar
        settings={settings}
        cartCount={cartCount}
        cartTotal={cartTotal}
        currentView={currentView}
        onSelectView={(view) => setCurrentView(view)}
        onOpenCartDrawer={() => setIsCartOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        currentProfile={currentProfile}
        onOpenProfileModal={() => {
          setIsFirstVisitAuth(false);
          setIsProfileModalOpen(true);
        }}
      />

      {/* 2. Main Page Content Routed by Active View Tab */}
      {currentView === 'menu' && (
        <>
          {/* Hero Showcase Banner */}
          <HeroBanner
            settings={settings}
            onScrollToMenu={handleScrollToMenu}
            onOpenCart={() => setCurrentView('cart')}
          />

          {/* Category Filter Bar */}
          <div ref={menuSectionRef}>
            <CategoryNav
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              categoryCounts={categoryCounts}
            />
          </div>

          {/* Menu Grid Container */}
          <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-stone-800/80 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl sm:text-3xl font-black font-display text-white">
                    {currentCategoryObj?.name || '賯丕卅賲丞 丕賱胤毓丕賲'}
                  </h2>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2.5 py-0.5 rounded-full">
                    {filteredDishes.length} 氐賳賮 賲鬲賵賮乇
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-400 mt-1">
                  {currentCategoryObj?.description || '丕禺鬲乇 賵噩亘鬲賰 丕賱賲賮囟賱丞 賵爻賳氐賱賰 亘賴丕 胤丕夭噩丞 賵爻丕禺賳丞'}
                </p>
              </div>

              {/* Owner shortcut to admin tab */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentView('admin')}
                  className="text-xs text-amber-400/90 hover:text-amber-300 font-semibold flex items-center gap-1.5 bg-stone-900 border border-amber-500/30 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>賱賵丨丞 廿丿丕乇丞 丕賱兀爻毓丕乇 賵丕賱丨爻丕亘 丕賱亘賳賰賷</span>
                </button>
              </div>
            </div>

            {/* Dishes Cards Grid */}
            {filteredDishes.length === 0 ? (
              <div className="py-20 text-center text-stone-400 bg-stone-900/50 rounded-3xl border border-stone-800 p-8">
                <p className="text-base font-bold text-stone-300">賱賲 賷鬲賲 丕賱毓孬賵乇 毓賱賶 兀胤亘丕賯 鬲胤丕亘賯 亘丨孬賰</p>
                <p className="text-xs text-stone-500 mt-1">
                  噩乇亘 鬲睾賷賷乇 丕賱賰賱賲丕鬲 丕賱賲賮鬲丕丨賷丞 兀賵 丕禺鬲乇 鬲氐賳賷賮丕賸 丌禺乇 賲賳 丕賱兀毓賱賶
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                  }}
                  className="mt-4 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl"
                >
                  毓乇囟 噩賲賷毓 丕賱兀胤亘丕賯
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                {filteredDishes.map((dish) => {
                  const inCart = cart.find((i) => i.dish.id === dish.id);
                  const qty = inCart ? inCart.quantity : 0;

                  return (
                    <DishCard
                      key={dish.id}
                      dish={dish}
                      quantityInCart={qty}
                      onAddToCart={handleAddToCart}
                      onUpdateQuantity={handleUpdateQuantity}
                      currency={settings.currency}
                      isOwnerMode={true}
                      onQuickPriceEdit={() => setCurrentView('admin')}
                    />
                  );
                })}
              </div>
            )}
          </main>

          {/* Floating Bottom Quick Cart (Mobile and desktop shortcut) */}
          {cartCount > 0 && (
            <div className="sticky bottom-4 z-30 max-w-lg mx-auto w-[92%] sm:w-full px-2 sm:px-4">
              <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 p-1 rounded-2xl shadow-2xl shadow-amber-500/25 border border-amber-300">
                <button
                  onClick={() => setCurrentView('cart')}
                  className="w-full py-3 px-4 bg-stone-950 text-white rounded-xl flex items-center justify-between font-bold text-sm hover:bg-stone-900 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-stone-950 flex items-center justify-center font-bold font-mono">
                      {cartCount}
                    </div>
                    <span>爻賱丞 丕賱丨噩夭 賵廿鬲賲丕賲 丕賱胤賱亘 賲亘丕卮乇丞</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-amber-400 text-base font-black">
                    <span>{cartTotal}</span>
                    <span className="text-xs font-sans text-stone-300">{settings.currency}</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: In-Page Cart & Booking View (Directly in main design) */}
      {currentView === 'cart' && (
        <main className="flex-1 w-full">
          <InPageCart
            cartItems={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onOrderSuccess={handleOrderSuccess}
            settings={settings}
            currentProfile={currentProfile}
            onOpenProfileModal={() => {
              setIsFirstVisitAuth(false);
              setIsProfileModalOpen(true);
            }}
            onBackToMenu={() => setCurrentView('menu')}
          />
        </main>
      )}

      {/* VIEW 3: In-Page Admin & Pricing Dashboard (Directly in main design) */}
      {currentView === 'admin' && (
        <main className="flex-1 w-full">
          <AdminPriceManager
            embedded={true}
            isOpen={true}
            onClose={() => setCurrentView('menu')}
            onBackToMenu={() => setCurrentView('menu')}
            dishes={menu}
            orders={orders}
            settings={settings}
            onMenuUpdated={(updated) => setMenu(updated)}
            onOrdersUpdated={(updated) => setOrders(updated)}
            onSettingsUpdated={(updated) => setSettings(updated)}
          />
        </main>
      )}

      {/* VIEW 4: In-Page Order Tracker */}
      {currentView === 'tracker' && (
        <main className="flex-1 w-full">
          <OrderTrackerModal
            embedded={true}
            isOpen={true}
            onClose={() => setCurrentView('menu')}
            onBackToMenu={() => setCurrentView('menu')}
            orders={orders}
            settings={settings}
          />
        </main>
      )}

      {/* 6. Footer */}
      <Footer
        settings={settings}
        onOpenAdmin={() => setIsAdminOpen(true)}
      />

      {/* 7. Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onOrderSuccess={handleOrderSuccess}
        settings={settings}
        currentProfile={currentProfile}
        onOpenProfileModal={() => {
          setIsFirstVisitAuth(false);
          setIsProfileModalOpen(true);
        }}
      />

      {/* 8. Order Confirmation & Confetti Modal */}
      <OrderConfirmationModal
        order={confirmedOrder}
        onClose={() => setConfirmedOrder(null)}
        settings={settings}
      />

      {/* 9. Admin & Price Management Modal */}
      <AdminPriceManager
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        dishes={menu}
        orders={orders}
        settings={settings}
        onMenuUpdated={(updated) => setMenu(updated)}
        onOrdersUpdated={(updated) => setOrders(updated)}
        onSettingsUpdated={(updated) => setSettings(updated)}
      />

      {/* 10. Customer Order Tracker Modal */}
      <OrderTrackerModal
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
        orders={orders}
        settings={settings}
      />

      {/* 11. Customer Account / First Visit Modal */}
      <CustomerAuthModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentProfile={currentProfile}
        onProfileSaved={(p) => setCurrentProfile(p)}
        isFirstVisit={isFirstVisitAuth}
      />
    </div>
  );
}
