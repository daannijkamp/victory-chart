/*eslint no-magic-numbers: ["error", { "ignore": [-1, 0, 1, 2] }]*/
import PropTypes from "prop-types";
import React from "react";
import { VictoryContainer, VictoryTooltip, Helpers, TextSize } from "victory-core";
import VoronoiHelpers from "./voronoi-helpers";
import { omit, defaults } from "lodash";

export const voronoiContainerMixin = (base) => class VictoryVoronoiContainer extends base {
  static displayName = "VictoryVoronoiContainer";
  static propTypes = {
    ...VictoryContainer.propTypes,
    dimension: PropTypes.oneOf(["x", "y"]),
    labelComponent: PropTypes.element,
    labels: PropTypes.func,
    onActivated: PropTypes.func,
    onDeactivated: PropTypes.func,
    radius: PropTypes.number,
    standalone: PropTypes.bool,
    voronoiPadding: PropTypes.number
  };
  static defaultProps = {
    ...VictoryContainer.defaultProps,
    labelComponent: <VictoryTooltip/>,
    voronoiPadding: 5
  };

  static defaultEvents = [{
    target: "parent",
    eventHandlers: {
      onMouseLeave: (evt, targetProps) => {
        return VoronoiHelpers.onMouseLeave(evt, targetProps);
      },
      onMouseMove: (evt, targetProps) => {
        const mutations = VoronoiHelpers.onMouseMove(evt, targetProps);

        if (mutations.id !== this.mouseMoveMutationId) { // eslint-disable-line
          this.mouseMoveMutationId = mutations.id; // eslint-disable-line
          return mutations.mutations;
        }

        return undefined;
      }
    }
  }, {
    target: "data",
    eventHandlers: {
      onMouseOver: () => null,
      onMouseOut: () => null,
      onMouseMove: () => null
    }
  }];

  getLabelPadding(style) {
    if (!style) {
      return 0;
    }
    const paddings = Array.isArray(style) ? style.map((s) => s.padding) : [style.padding];
    return Math.max(...paddings, 0);
  }

  getFlyoutSize(labelComponent, text, style) {
    const padding = this.getLabelPadding(style);
    const textSize = TextSize.approximateTextSize(text, style);
    return {
      x: labelComponent.width || textSize.width + padding,
      y: labelComponent.height || textSize.height + padding
    };
  }

  getLabelCornerRadius(props, labelProps) {
    if (typeof labelProps.cornerRadius !== "undefined") {
      return labelProps.cornerRadius;
    }
    const theme = props.theme || labelProps.theme;
    return theme.tooltip && theme.tooltip.cornerRadius || 0;
  }

  getFlyoutExtent(position, props, labelProps) {
    const { text, style } = labelProps;
    const { orientation, dx = 0, dy = 0 } = labelProps;
    const flyoutSize = this.getFlyoutSize(props.labelComponent, text, style);
    const cornerRadius = this.getLabelCornerRadius(props, labelProps);
    const x = position.x + dx + 2 * cornerRadius;
    const y = position.y + dy + 2 * cornerRadius;
    const width = orientation === "top" || orientation === "bottom" ?
      flyoutSize.x / 2 :
      flyoutSize.x;
    const horizontalSign = orientation === "left" ? -1 : 1;
    const verticalSign = orientation === "bottom" ? 1 : -1;
    const extent = {};
    if (orientation === "top" || orientation === "bottom") {
      extent.x = [x - width, x + width];
    } else {
      extent.x = [x, x + horizontalSign * width];
    }
    extent.y = [y, y + verticalSign * flyoutSize.y];
    return {
      x: [Math.min(...extent.x), Math.max(...extent.x)],
      y: [Math.min(...extent.y), Math.max(...extent.y)]
    };
  }

  getLabelPosition(props, points, labelProps) {
    const { mousePosition, dimension, scale, voronoiPadding } = props;
    const dataX = points[0]._x1 !== undefined ? points[0]._x1 : points[0]._x;
    const dataY = points[0]._y1 !== undefined ? points[0]._y1 : points[0]._y;
    const basePosition = {
      x: scale.x(dataX),
      y: scale.y(dataY)
    };
    if (!dimension || points.length < 2) {
      return basePosition;
    }

    const x = dimension === "y" ? mousePosition.x : basePosition.x;
    const y = dimension === "x" ? mousePosition.y : basePosition.y;
    const range = { x: scale.x.range(), y: scale.y.range() };
    const extent = {
      x: [Math.min(...range.x) + voronoiPadding, Math.max(...range.x) - voronoiPadding],
      y: [Math.min(...range.y) + voronoiPadding, Math.max(...range.y) - voronoiPadding]
    };
    const flyoutExtent = this.getFlyoutExtent({ x, y }, props, labelProps);
    const adjustments = {
      x: [
        flyoutExtent.x[0] < extent.x[0] ? extent.x[0] - flyoutExtent.x[0] : 0,
        flyoutExtent.x[1] > extent.x[1] ? flyoutExtent.x[1] - extent.x[1] : 0
      ],
      y: [
        flyoutExtent.y[0] < extent.y[0] ? extent.y[0] - flyoutExtent.y[0] : 0,
        flyoutExtent.y[1] > extent.y[1] ? flyoutExtent.y[1] - extent.y[1] : 0
      ]
    };
    return {
      x: Math.round(x + adjustments.x[0] - adjustments.x[1]),
      y: Math.round(y + adjustments.y[0] - adjustments.y[1])
    };
  }

  getStyle(props, points, type) {
    const { labels, labelComponent, theme } = props;
    const componentProps = labelComponent.props || {};
    const themeStyles = theme && theme.voronoi && theme.voronoi.style ? theme.voronoi.style : {};
    const componentStyle = type === "flyout" ? componentProps.flyoutStyle : componentProps.style;
    const defaultStyles = defaults({}, componentStyle, themeStyles[type]);
    return points.reduce((memo, point) => {
      const text = Helpers.evaluateProp(labels, point, true);
      const textArray = text ? `${text}`.split("\n") : [];
      const baseStyle = point.style && point.style[type] || {};
      const style = Helpers.evaluateStyle(defaults({}, baseStyle, defaultStyles), point, true);
      const styleArray = textArray.length ? textArray.map(() => style) : [style];
      memo = memo.concat(styleArray);
      return memo;
    }, []);
  }

  getDefaultLabelProps(props, points) {
    const { dimension } = props;
    const multiPoint = dimension && points.length > 1;
    return {
      orientation: multiPoint ? "top" : undefined,
      pointerLength: multiPoint ? 0 : undefined
    };
  }

  getLabelProps(props, points) {
    const { labels, scale, labelComponent, theme } = props;
    const text = points.reduce((memo, point) => {
      const t = Helpers.evaluateProp(labels, point, true);
      if (t === null || t === undefined) {
        return memo;
      }
      memo = memo.concat(`${t}`.split("\n"));
      return memo;
    }, []);
    const style = this.getStyle(props, points, "labels");
    const labelProps = defaults(
      {
        theme, style, text, scale,
        active: true,
        renderInPortal: false,
        flyoutStyle: this.getStyle(props, points, "flyout")[0],
        datum: omit(points[0], ["childName", "style", "continuous"])
      },
      labelComponent.props,
      this.getDefaultLabelProps(props, points)
    );
    const labelPosition = this.getLabelPosition(props, points, labelProps);
    return { ...labelProps, ...labelPosition };
  }

  getTooltip(props) {
    const { labels, activePoints, labelComponent } = props;
    if (!labels) {
      return null;
    }
    if (Array.isArray(activePoints) && activePoints.length) {
      return React.cloneElement(labelComponent, this.getLabelProps(props, activePoints));
    } else {
      return null;
    }
  }

  // Overrides method in VictoryContainer
  getChildren(props) {
    const children = React.Children.toArray(props.children);
    return [...children, this.getTooltip(props)].map((component, i) => {
      return component ? React.cloneElement(component, { key: i }) : null;
    });
  }
};

export default voronoiContainerMixin(VictoryContainer);
