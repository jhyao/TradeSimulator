import React, { useState, useCallback, useEffect } from 'react';

export interface QuickTradeButton {
  id: string;
  label: string;
  side: 'buy' | 'sell' | 'open_long' | 'open_short' | 'close_long' | 'close_short';
  positionSizeType: 'percent' | 'quantity'; // How to specify position size
  positionPercent?: number; // Used when positionSizeType is 'percent'
  positionQuantity?: number; // Used when positionSizeType is 'quantity'
  priceType: 'market' | 'limit';
  priceOffsetType?: 'absolute' | 'percent';
  priceOffset?: number;
  color: string;
  tradingMode: 'spot' | 'future'; // Mark which mode this button is for
  isCustomLabel?: boolean; // Track if user customized the label
}

interface QuickTradeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (buttons: QuickTradeButton[]) => void;
  initialButtons: QuickTradeButton[];
  tradingMode: 'spot' | 'future';
}

const DEFAULT_COLORS = [
  '#28a745', // Green
  '#dc3545', // Red
  '#007bff', // Blue
  '#ffc107', // Yellow
  '#6f42c1', // Purple
  '#fd7e14', // Orange
  '#20c997', // Teal
  '#e83e8c', // Pink
];

const QuickTradeSettings: React.FC<QuickTradeSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
  initialButtons,
  tradingMode
}) => {
  const [buttons, setButtons] = useState<QuickTradeButton[]>(initialButtons);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Update buttons when initialButtons changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setButtons(initialButtons);
    }
  }, [isOpen, initialButtons]);

  const generateId = () => `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Generate auto label based on button configuration
  const generateAutoLabel = useCallback((button: Partial<QuickTradeButton>): string => {
    const sideMap: Record<string, string> = {
      'buy': 'Buy',
      'sell': 'Sell',
      'open_long': 'Long',
      'open_short': 'Short',
      'close_long': 'Close Long',
      'close_short': 'Close Short'
    };

    const sideName = button.side ? sideMap[button.side] : '';

    let sizeStr = '';
    if (button.positionSizeType === 'percent') {
      sizeStr = `${button.positionPercent || 0}%`;
    } else if (button.positionSizeType === 'quantity') {
      sizeStr = `${button.positionQuantity || 0}`;
    }

    let priceStr = '';
    if (button.priceType === 'market') {
      priceStr = '';
    } else if (button.priceType === 'limit') {
      if (button.priceOffsetType === 'percent' && button.priceOffset) {
        priceStr = ` Limit ${button.priceOffset > 0 ? '+' : ''}${button.priceOffset}%`;
      } else if (button.priceOffsetType === 'absolute' && button.priceOffset) {
        priceStr = ` Limit ${button.priceOffset > 0 ? '+' : ''}${button.priceOffset}`;
      }
    }

    return `${sideName} ${sizeStr}${priceStr}`.trim();
  }, []);

  const addNewButton = useCallback(() => {
    const newButton: QuickTradeButton = {
      id: generateId(),
      label: tradingMode === 'spot' ? 'Buy 50%' : 'Long 50%',
      side: tradingMode === 'spot' ? 'buy' : 'open_long',
      positionSizeType: 'percent',
      positionPercent: 50,
      priceType: 'market',
      priceOffsetType: 'absolute',
      priceOffset: 0,
      color: DEFAULT_COLORS[buttons.length % DEFAULT_COLORS.length],
      tradingMode: tradingMode,
      isCustomLabel: false
    };
    setButtons([...buttons, newButton]);
    setEditingId(newButton.id);
  }, [buttons, tradingMode]);

  const removeButton = useCallback((id: string) => {
    setButtons(buttons.filter(b => b.id !== id));
    if (editingId === id) setEditingId(null);
  }, [buttons, editingId]);

  const moveButton = useCallback((id: string, direction: 'up' | 'down') => {
    const index = buttons.findIndex(b => b.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === buttons.length - 1) return;

    const newButtons = [...buttons];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newButtons[index], newButtons[swapIndex]] = [newButtons[swapIndex], newButtons[index]];
    setButtons(newButtons);
  }, [buttons]);

  const updateButton = useCallback((id: string, updates: Partial<QuickTradeButton>) => {
    setButtons(buttons.map(b => {
      if (b.id !== id) return b;

      const updated = { ...b, ...updates };

      // If switching to limit order and no priceOffsetType set, default to 'absolute'
      if (updates.priceType === 'limit' && !updated.priceOffsetType) {
        updated.priceOffsetType = 'absolute';
        updated.priceOffset = updated.priceOffset !== undefined ? updated.priceOffset : 0;
      }

      // Auto-generate label if not custom or if config changed (but not label itself)
      if (!updated.isCustomLabel && !updates.hasOwnProperty('label')) {
        updated.label = generateAutoLabel(updated);
      }

      return updated;
    }));
  }, [buttons, generateAutoLabel]);

  const handleSave = useCallback(() => {
    onSave(buttons);
    onClose();
  }, [buttons, onSave, onClose]);

  if (!isOpen) return null;

  const editingButton = editingId ? buttons.find(b => b.id === editingId) : null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '20px' }}>Quick Trade Button Settings</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6c757d'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          display: 'flex',
          gap: '20px'
        }}>
          {/* Button List */}
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px'
            }}>
              <h4 style={{ margin: 0, fontSize: '16px' }}>Buttons ({buttons.length})</h4>
              <button
                onClick={addNewButton}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #007bff',
                  borderRadius: '4px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                + Add Button
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {buttons.map((button, index) => (
                <div
                  key={button.id}
                  onClick={() => setEditingId(button.id)}
                  style={{
                    padding: '12px',
                    border: `2px solid ${editingId === button.id ? '#007bff' : '#dee2e6'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: editingId === button.id ? '#f0f8ff' : 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  {/* Color indicator */}
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    backgroundColor: button.color,
                    flexShrink: 0
                  }} />

                  {/* Button info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{button.label}</div>
                    <div style={{ fontSize: '12px', color: '#6c757d' }}>
                      {button.side.toUpperCase()} •
                      {button.positionSizeType === 'percent' ? ` ${button.positionPercent}%` : ` QTY ${button.positionQuantity}`} •
                      {button.priceType.toUpperCase()}
                      {button.priceOffsetType === 'absolute' && button.priceOffset && ` ${button.priceOffset > 0 ? '+' : ''}${button.priceOffset}`}
                      {button.priceOffsetType === 'percent' && button.priceOffset && ` ${button.priceOffset > 0 ? '+' : ''}${button.priceOffset}%`}
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveButton(button.id, 'up'); }}
                      disabled={index === 0}
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        opacity: index === 0 ? 0.5 : 1
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveButton(button.id, 'down'); }}
                      disabled={index === buttons.length - 1}
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        cursor: index === buttons.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        opacity: index === buttons.length - 1 ? 0.5 : 1
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeButton(button.id); }}
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid #dc3545',
                        borderRadius: '4px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '16px'
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {buttons.length === 0 && (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6c757d',
                  fontSize: '14px'
                }}>
                  No buttons configured. Click "Add Button" to create one.
                </div>
              )}
            </div>
          </div>

          {/* Edit Form */}
          {editingButton && (
            <div style={{
              flex: 1,
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              padding: '15px',
              backgroundColor: '#f8f9fa'
            }}>
              <h4 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>Edit Button</h4>

              {/* Label */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                  Label
                  {!editingButton.isCustomLabel && (
                    <span style={{ fontSize: '11px', color: '#6c757d', fontWeight: 'normal', marginLeft: '8px' }}>
                      (Auto-generated)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={editingButton.label}
                  onChange={(e) => updateButton(editingButton.id, { label: e.target.value, isCustomLabel: true })}
                  onBlur={(e) => {
                    // If user clears the label, revert to auto-generated
                    if (!e.target.value.trim()) {
                      updateButton(editingButton.id, { isCustomLabel: false });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Auto-generated from settings"
                />
              </div>

              {/* Side */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                  Trade Side
                </label>
                <select
                  value={editingButton.side}
                  onChange={(e) => updateButton(editingButton.id, { side: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  {tradingMode === 'spot' ? (
                    <>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </>
                  ) : (
                    <>
                      <option value="open_long">Open Long</option>
                      <option value="open_short">Open Short</option>
                      <option value="close_long">Close Long</option>
                      <option value="close_short">Close Short</option>
                    </>
                  )}
                </select>
              </div>

              {/* Position Size Type */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                  Position Size Type
                </label>
                <select
                  value={editingButton.positionSizeType || 'percent'}
                  onChange={(e) => updateButton(editingButton.id, { positionSizeType: e.target.value as 'percent' | 'quantity' })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="quantity">Quantity</option>
                </select>
              </div>

              {/* Position Size Value */}
              {editingButton.positionSizeType === 'percent' ? (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                    Position Size (%)
                  </label>
                  <input
                    key={`${editingButton.id}-percent`}
                    type="number"
                    min="0"
                    max="100"
                    step="10"
                    defaultValue={editingButton.positionPercent || 50}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      updateButton(editingButton.id, { positionPercent: Math.max(1, Math.min(100, value)) });
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              ) : (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                    Quantity
                  </label>
                  <input
                    key={`${editingButton.id}-quantity`}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={editingButton.positionQuantity || 0}
                    onBlur={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      updateButton(editingButton.id, { positionQuantity: Math.max(0, value) });
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Enter quantity"
                  />
                </div>
              )}

              {/* Price Type */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                  Price Type
                </label>
                <select
                  value={editingButton.priceType}
                  onChange={(e) => updateButton(editingButton.id, { priceType: e.target.value as 'market' | 'limit' })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit (with offset)</option>
                </select>
              </div>

              {/* Price Offset (only for limit orders) */}
              {editingButton.priceType === 'limit' && (
                <>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                      Price Offset Type
                    </label>
                    <select
                      value={editingButton.priceOffsetType || 'absolute'}
                      onChange={(e) => updateButton(editingButton.id, { priceOffsetType: e.target.value as 'absolute' | 'percent' })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="absolute">Absolute (+/- $X)</option>
                      <option value="percent">Percentage (+/- X%)</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                      Price Offset {editingButton.priceOffsetType === 'percent' ? '(%)' : '($)'}
                    </label>
                    <input
                      key={`${editingButton.id}-offset`}
                      type="number"
                      step={editingButton.priceOffsetType === 'percent' ? '0.1' : '0.01'}
                      defaultValue={editingButton.priceOffset !== undefined ? editingButton.priceOffset : 0}
                      onBlur={(e) => {
                        const value = e.target.value;
                        updateButton(editingButton.id, { priceOffset: value === '' || value === '-' ? 0 : parseFloat(value) || 0 });
                      }}
                      placeholder="0 for market price"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '3px' }}>
                      Use negative values for below market, positive for above market
                    </div>
                  </div>
                </>
              )}

              {/* Color */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                  Button Color
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {DEFAULT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => updateButton(editingButton.id, { color })}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '4px',
                        backgroundColor: color,
                        border: editingButton.color === color ? '3px solid #000' : '1px solid #dee2e6',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={editingButton.color}
                  onChange={(e) => updateButton(editingButton.id, { color: e.target.value })}
                  style={{
                    width: '100%',
                    height: '40px',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {/* Preview */}
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
                  Preview
                </label>
                <button
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: editingButton.color,
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {editingButton.label}
                </button>
              </div>
            </div>
          )}

          {!editingButton && buttons.length > 0 && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6c757d',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              Select a button from the list to edit its settings
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '15px 20px',
          borderTop: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #6c757d',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#6c757d',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#007bff',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickTradeSettings;
