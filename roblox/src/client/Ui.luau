-- Arayüz yardımcıları: renkler, yazı tipleri ve kısa kurucular.

local Ui = {}

Ui.Colors = {
	ink = Color3.fromRGB(12, 14, 12),
	panel = Color3.fromRGB(22, 26, 22),
	panel2 = Color3.fromRGB(34, 40, 34),
	line = Color3.fromRGB(74, 84, 68),
	text = Color3.fromRGB(236, 234, 222),
	dim = Color3.fromRGB(160, 162, 148),
	accent = Color3.fromRGB(222, 184, 92),
	good = Color3.fromRGB(120, 210, 110),
	bad = Color3.fromRGB(236, 82, 70),
	white = Color3.new(1, 1, 1),
	black = Color3.new(0, 0, 0),
}

Ui.Font = Enum.Font.GothamBold
Ui.FontMedium = Enum.Font.GothamMedium
Ui.FontBlack = Enum.Font.GothamBlack

-- make("Frame", { Size = ..., Parent = ... }, { çocuklar })
function Ui.make(className, props, children)
	local instance = Instance.new(className)
	local parent
	for key, value in pairs(props or {}) do
		if key == "Parent" then
			parent = value
		else
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function Ui.corner(radius)
	return Ui.make("UICorner", { CornerRadius = UDim.new(0, radius or 6) })
end

function Ui.round()
	return Ui.make("UICorner", { CornerRadius = UDim.new(1, 0) })
end

function Ui.stroke(color, thickness, transparency)
	return Ui.make("UIStroke", {
		Color = color or Ui.Colors.line,
		Thickness = thickness or 1,
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function Ui.textStroke(transparency)
	return Ui.make("UIStroke", {
		Color = Ui.Colors.black,
		Thickness = 1.5,
		Transparency = transparency or 0.4,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
	})
end

function Ui.pad(all, horizontal)
	local v = UDim.new(0, all)
	local h = UDim.new(0, horizontal or all)
	return Ui.make("UIPadding", { PaddingTop = v, PaddingBottom = v, PaddingLeft = h, PaddingRight = h })
end

function Ui.list(direction, padding, horizontalAlign, verticalAlign)
	return Ui.make("UIListLayout", {
		FillDirection = direction or Enum.FillDirection.Vertical,
		Padding = UDim.new(0, padding or 0),
		HorizontalAlignment = horizontalAlign or Enum.HorizontalAlignment.Left,
		VerticalAlignment = verticalAlign or Enum.VerticalAlignment.Top,
		SortOrder = Enum.SortOrder.LayoutOrder,
	})
end

function Ui.label(props, children)
	local defaults = {
		BackgroundTransparency = 1,
		Font = Ui.Font,
		TextColor3 = Ui.Colors.text,
		TextSize = 16,
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
	}
	for key, value in pairs(props) do
		defaults[key] = value
	end
	return Ui.make("TextLabel", defaults, children)
end

function Ui.button(props, children)
	local defaults = {
		AutoButtonColor = true,
		BackgroundColor3 = Ui.Colors.panel2,
		BorderSizePixel = 0,
		Font = Ui.Font,
		TextColor3 = Ui.Colors.text,
		TextSize = 16,
		Text = "",
	}
	for key, value in pairs(props) do
		defaults[key] = value
	end
	return Ui.make("TextButton", defaults, children)
end

function Ui.frame(props, children)
	local defaults = {
		BackgroundColor3 = Ui.Colors.panel,
		BorderSizePixel = 0,
	}
	for key, value in pairs(props) do
		defaults[key] = value
	end
	return Ui.make("Frame", defaults, children)
end

-- Ekranı kaplayan, "tasarım pikseli" ile çalışan tuval. 1024x600 için
-- tasarlanır; telefonda da bilgisayarda da aynı düzen orantılı büyür/küçülür.
Ui.DesignWidth = 1024
Ui.DesignHeight = 600

function Ui.canvasScale(viewport)
	return math.clamp(math.min(viewport.X / Ui.DesignWidth, viewport.Y / Ui.DesignHeight), 0.6, 1.35)
end

function Ui.canvas(screenGui, camera)
	local canvas = Ui.make("Frame", {
		Name = "Canvas",
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(1, 1),
		Parent = screenGui,
	})
	local scale = Ui.make("UIScale", { Parent = canvas })
	-- Ekranın gerçekten kullanılabilen boyutu: üst çubuğun altında kalan
	-- ekranlarda (IgnoreGuiInset = false) görüntü alanından küçüktür
	local function available()
		local ok, size = pcall(function()
			return screenGui.AbsoluteSize
		end)
		if ok and size and size.X > 0 and size.Y > 0 then
			return size
		end
		return camera.ViewportSize
	end
	local function update()
		local value = Ui.canvasScale(available())
		scale.Scale = value
		canvas.Size = UDim2.fromScale(1 / value, 1 / value)
	end
	update()
	camera:GetPropertyChangedSignal("ViewportSize"):Connect(update)
	screenGui:GetPropertyChangedSignal("AbsoluteSize"):Connect(update)
	return canvas, scale
end

function Ui.teamColor(teamId)
	if teamId == "Sahin" then
		return Color3.fromRGB(70, 150, 255)
	elseif teamId == "Ejder" then
		return Color3.fromRGB(255, 104, 74)
	end
	return Ui.Colors.text
end

return Ui
